-- R5 T013 Reset / clear my data — contracts/database.md rules 1, 3, 4, 5 (FR-007 – FR-012; SC-003).
begin;
select plan(17);

select tests.as_superuser();
select tests.create_user('data.reset@example.com') as asha_id \gset
select tests.create_user('data.reset.other@example.com') as other_id \gset
select tests.tx_world(:'other_id') as wo \gset
select tests.tx_world(:'asha_id') as w \gset
select (:'w'::jsonb ->> 'bank') as bank, (:'w'::jsonb ->> 'groceries') as groceries \gset
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'bank', '5000',
         jsonb_build_object('categoryId', :'groceries'))));
select tests.apply1(tests.lchange('account_group', gen_random_uuid(), 'create', '{"name":"Mine","sortKey":"a0"}'));
select tests.as_superuser();
update public.user_preferences set categories_start = 'suggested', number_format = 'international' where user_id = :'asha_id';
select count(*)::int as other_history from public.audit_events where details ->> 'ownerId' = :'other_id' \gset
select (app.pull_changes(0) ->> 'cursor') as old_cursor from (select tests.authenticate_as(:'asha_id')) x \gset

-- ---------------------------------------------------------------- the reset
select tests.authenticate_as(:'asha_id');
select throws_ok($$ select app._reset_user_data(auth.uid(), 'web') $$, '42501', null, 'the worker is not callable by clients');
select is(app.reset_my_data('web') -> 'removed',
          '{"accounts": 3, "categories": 3, "groups": 1, "payees": 3, "rates": 0, "tags": 1, "transactions": 1}'::jsonb,
          'US2 2: says what was removed');
select tests.as_superuser();
select is((select count(*)::int from public.accounts where user_id = :'asha_id')
        + (select count(*)::int from public.account_groups where user_id = :'asha_id')
        + (select count(*)::int from public.categories where user_id = :'asha_id')
        + (select count(*)::int from public.tags where user_id = :'asha_id')
        + (select count(*)::int from public.payees where user_id = :'asha_id')
        + (select count(*)::int from public.transactions where user_id = :'asha_id')
        + (select count(*)::int from private.transaction_postings where user_id = :'asha_id'), 0,
          'FR-007: no financial row (or posting) of the user remains');
select is((select count(*)::int from public.audit_events
            where target_type in ('account', 'account_group', 'category', 'tag', 'payee', 'transaction', 'person_rate')
              and details ->> 'ownerId' = :'asha_id'), 0, 'clarify Q1: and none of their history');
select is((select count(*)::int from public.audit_events where action = 'data_reset' and target_id = :'asha_id'), 1,
          'FR-011: one data_reset entry');
select is((select details from public.audit_events where action = 'data_reset' and target_id = :'asha_id'),
          jsonb_build_object('ownerId', :'asha_id'), 'which says nothing about the removed records');
select is((select count(*)::int from private.applied_changes where user_id = :'asha_id'), 0, 'their replay memory is cleared');
select ok((select status = 'active' from public.profiles where user_id = :'asha_id'), 'FR-008: the profile stays');
select is((select number_format from public.user_preferences where user_id = :'asha_id'), 'international', 'preferences stay');
select is((select categories_start from public.user_preferences where user_id = :'asha_id'), null, 'US2 3: the start choice is offered again');
select is((select count(*)::int from public.audit_events where details ->> 'ownerId' = :'other_id'), :'other_history'::int,
          'US2 4: another user''s data and history are untouched');
select is((select count(*)::int from public.accounts where user_id = :'other_id'), 3, 'and their records');

-- ---------------------------------------------------------------- other devices (FR-012)
select tests.authenticate_as(:'asha_id');
select is(app.pull_changes(:'old_cursor'::bigint) -> 'reset', 'true'::jsonb, 'US2 5: a pull from before the reset says start over');
select is(app.pull_changes(0) -> 'reset', null, 'a pull from 0 is ordinary');
select is(app.apply_changes(jsonb_build_array(tests.change('account', gen_random_uuid(), 'create', tests.account_fields('Offline'),
            tests.hlc(1700000000000))), 'android') -> 0 ->> 'code', 'DATA_RESET', 'a change made before the reset is refused');
select is(tests.outcome(tests.lchange('account', gen_random_uuid(), 'create', tests.account_fields('After'))), 'applied',
          'a change made after it is applied');
select throws_ok($$ select count(*) from private.data_resets $$, '42501', null, 'the reset point is not readable by clients');

select * from finish();
rollback;
