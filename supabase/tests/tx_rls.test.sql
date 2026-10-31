-- R4 T005 Transaction access rules — contracts/database.md rules 1–6 (SC-004).
begin;
select plan(19);

select tests.as_superuser();
update public.profiles set role = 'member' where role = 'owner';
select tests.create_user('tx.owner@example.com', 'owner') as owner_id \gset
select tests.create_user('tx.asha@example.com') as asha_id \gset
select tests.create_user('tx.ravi@example.com') as ravi_id \gset
select tests.tx_world(:'asha_id') as wa \gset
select tests.tx_world(:'ravi_id') as wr \gset
select gen_random_uuid() as asha_tx \gset
select gen_random_uuid() as ravi_tx \gset
select gen_random_uuid() as ravi_rate \gset

select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.lchange('transaction', :'asha_tx', 'create', tests.tx_fields('expense', (:'wa'::jsonb ->> 'bank')::uuid, '1000')));
select tests.authenticate_as(:'ravi_id');
select tests.apply1(tests.lchange('transaction', :'ravi_tx', 'create', tests.tx_fields('expense', (:'wr'::jsonb ->> 'bank')::uuid, '2000')));
select tests.apply1(tests.lchange('person_rate', :'ravi_rate', 'create',
                    jsonb_build_object('payeeId', :'wr'::jsonb ->> 'ravi', 'effectiveMonth', '2026-04-01', 'rateE4', 10000)));

-- ---------------------------------------------------------------- 1: A cannot read B
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from public.transactions), 1, 'rule 1: a user sees only their own transactions');
select is((select count(*)::int from public.person_rates), 0, 'rule 1: another user''s rates are invisible');
select ok(not (app.pull_changes(0)::text like '%' || :'ravi_tx' || '%'), 'rule 1: pull never contains another user''s transactions');
select throws_ok($$ select count(*) from private.transaction_postings $$, '42501', null, 'rule 3: postings are not readable');
select is(app.balance_movements() -> 'accounts', jsonb_build_object(:'wa'::jsonb ->> 'bank', '-1000'),
          'rule 1: balance movements hold only the caller''s own accounts');
select is(app.balance_movements() -> 'people', '{}'::jsonb, 'rule 1: and none of another user''s people');

-- ---------------------------------------------------------------- 2: owner-admin
select tests.authenticate_as(:'owner_id');
select is((select count(*)::int from public.transactions) + (select count(*)::int from public.person_rates), 0,
          'rule 2: the owner-admin reads none');

-- ---------------------------------------------------------------- 3: no direct writes
select tests.authenticate_as(:'asha_id');
select throws_ok(format($$ update public.transactions set amount_minor = 1 where id = %L $$, :'asha_tx'), '42501', null,
                 'rule 3: direct update of transactions is refused');
select throws_ok(format($$ delete from public.person_rates where id = %L $$, :'ravi_rate'), '42501', null,
                 'rule 3: direct delete from person_rates is refused');

-- ---------------------------------------------------------------- 4: another user's ids
select is(tests.outcome(tests.lchange('transaction', :'ravi_tx', 'update', '{"notes":"x"}')), 'NOT_FOUND',
          'rule 4: editing another user''s transaction reports NOT_FOUND');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('expense', (:'wr'::jsonb ->> 'bank')::uuid, '100'))), 'VALIDATION_FAILED',
          'rule 4: another user''s account is refused');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('expense', (:'wa'::jsonb ->> 'bank')::uuid, '100', jsonb_build_object('categoryId', :'wr'::jsonb ->> 'groceries')))),
          'INVALID_CATEGORY', 'rule 4: another user''s category is refused');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('person', (:'wa'::jsonb ->> 'bank')::uuid, '100', jsonb_build_object('payeeId', :'wr'::jsonb ->> 'ravi', 'personAction', 'lent')))),
          'VALIDATION_FAILED', 'rule 4: another user''s person is refused');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('expense', (:'wa'::jsonb ->> 'bank')::uuid, '100', jsonb_build_object('tagIds', jsonb_build_array(:'wr'::jsonb ->> 'tag'))))),
          'VALIDATION_FAILED', 'rule 4: another user''s tag is refused');
select tests.as_superuser();
select is((select amount_minor from public.transactions where id = :'ravi_tx'), 2000::bigint, 'rule 4: the other user''s row is unchanged');

-- ---------------------------------------------------------------- 6: disabled users, history, erasure
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from public.audit_events where target_type in ('transaction', 'person_rate')), 0,
          'rule 6: clients cannot read transaction history');
select tests.as_superuser();
update public.profiles set status = 'disabled' where user_id = :'asha_id';
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from public.transactions), 0, 'rule 6: a disabled user reads no transactions');
select throws_ok($$ select app.balance_movements() $$, 'P0001', 'USER_INACTIVE', 'rule 6: a disabled user reads no balances');

select tests.as_superuser();
select app.scrub_user_from_audit(:'ravi_id', 'tx.ravi@example.com');
delete from auth.users where id = :'ravi_id';
select is((select count(*)::int from public.transactions where user_id = :'ravi_id')
        + (select count(*)::int from public.person_rates where user_id = :'ravi_id')
        + (select count(*)::int from private.transaction_postings where user_id = :'ravi_id')
        + (select count(*)::int from public.audit_events
            where target_type in ('transaction', 'person_rate') and details ->> 'ownerId' = :'ravi_id'),
          0, 'rule 6: erasure leaves no transaction, rate, posting or history of the user');

select * from finish();
rollback;
