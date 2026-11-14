-- R10 T007 Import sessions (contracts/export-import.md; research R10-05, R10-07).
begin;
select plan(17);

select tests.as_superuser();
select tests.create_user('exp.asha@example.com') as asha \gset
select tests.create_user('exp.ravi@example.com') as ravi \gset
select gen_random_uuid() as bank, gen_random_uuid() as person, gen_random_uuid() as tx, gen_random_uuid() as proposal \gset

-- ---------------------------------------------------------------- begin: only into empty data, one at a time
select tests.authenticate_as(:'asha');
select app.import_begin('web') as imp \gset
select ok(:'imp' is not null, 'an import opens into empty data');
select tests.authenticate_as(:'ravi');
select throws_ok(format($$ select app.import_chunk(%L, '[{"x":1}]') $$, :'imp'), 'P0001', 'IMPORT_NOT_OPEN',
                 'another user cannot use the session');
select is(app.my_open_import(), null, 'nor see it');

-- ---------------------------------------------------------------- chunks through the appliers
select tests.authenticate_as(:'asha');
select is(app.import_chunk(:'imp', jsonb_build_array(
            tests.lchange('account', :'bank', 'create', tests.account_fields('Bank', 'bank', '10000000')),
            tests.lchange('payee', :'person', 'create', tests.person_fields('Ravi', '1500000', '{"interestMode":"automatic"}'))))
          ->> 'applied', '2', 'a chunk applies through the change appliers');
select throws_like(format($$ select app.import_chunk(%L, %L::jsonb) $$, :'imp', jsonb_build_array(
                     tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'bank'::uuid, '100')),
                     tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', gen_random_uuid(), '100')))),
                   'IMPORT_REJECTED:1:%', 'a refused change names its place and code');
select is((select count(*)::int from public.transactions), 0, 'and its whole chunk is undone');
select is(app.import_chunk(:'imp', jsonb_build_array(
            tests.lchange('transaction', :'tx', 'create', tests.tx_fields('expense', :'bank'::uuid, '2500')),
            tests.lchange('transaction', :'proposal', 'create',
              jsonb_build_object('kind', 'interest', 'flow', 'out', 'date', '2026-10-31', 'payeeId', :'person', 'amountMinor', '675', 'confirmed', false))))
          ->> 'applied', '2', 'transactions follow');
select throws_ok(format($$ select app.import_chunk(%L, '[]') $$, :'imp'), 'P0001', 'VALIDATION_FAILED', 'an empty chunk is refused');

-- ---------------------------------------------------------------- finish: interest marks, history
select throws_ok(format($$ select app.import_finish(%L, %L::jsonb, null) $$, :'imp',
                   jsonb_build_object('proposals', jsonb_build_array(jsonb_build_object('transactionId', :'tx', 'interestMonth', '2026-10-01')))),
                 'P0001', 'VALIDATION_FAILED', 'only interest entries can be marked as proposals');
select is(app.import_finish(:'imp', jsonb_build_object(
            'proposals', jsonb_build_array(jsonb_build_object('transactionId', :'proposal', 'interestMonth', '2026-10-01', 'userEdited', false)),
            'declined', jsonb_build_array(jsonb_build_object('payeeId', :'person', 'month', '2026-09-01'))), null)
          ->> 'transaction', '2', 'finishing reports what was created');
select is((select generated::text || ' ' || interest_month::text || ' ' || confirmed::text from public.transactions where id = :'proposal'),
          'true 2026-10-01 false', 'the restored proposal is a proposal again');
select is((select count(*)::int from public.transactions where generated and interest_month = '2026-09-01' and state = 'deleted'), 1,
          'a declined month is remembered');
select is(app.my_open_import(), null, 'the session is closed');
select throws_ok(format($$ select app.import_chunk(%L, '[{"x":1}]') $$, :'imp'), 'P0001', 'IMPORT_NOT_OPEN', 'and cannot be used again');
select throws_ok($$ select app.import_begin('web') $$, 'P0001', 'NOT_EMPTY', 'a second import needs empty data');

-- ---------------------------------------------------------------- abort: the reset
select tests.authenticate_as(:'ravi');
select app.import_begin('web') as imp2 \gset
select app.import_chunk(:'imp2', jsonb_build_array(tests.lchange('account', gen_random_uuid(), 'create', tests.account_fields('Cash', 'cash'))));
select is(app.import_abort(:'imp2') ->> 'accounts', '1', 'undoing an import removes what it created');

select tests.as_superuser();
select is((select array_agg(action::text order by action::text) from public.audit_events
            where action in ('data_imported', 'data_import_undone') and details ->> 'ownerId' in (:'asha', :'ravi')),
          array['data_import_undone', 'data_imported'], 'history records the import and the undo, without contents');

select * from finish();
rollback;
