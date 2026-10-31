-- R5 T007, T019 Loading the demo household — contracts/database.md rules 1–2 (FR-001, FR-004, FR-006,
-- FR-011, FR-013). The full household is loaded by the integration and e2e tests; here small lists.
begin;
select plan(13);

select tests.as_superuser();
select tests.create_user('data.load@example.com') as asha_id \gset
select tests.create_user('data.load.other@example.com') as other_id \gset
select gen_random_uuid() as acc \gset
select gen_random_uuid() as cat \gset
select gen_random_uuid() as tx \gset
select tests.tx_world(:'other_id') as wo \gset

-- A small "household": an account, a category and an expense using both.
select jsonb_build_array(
  tests.lchange('account', :'acc', 'create', tests.account_fields('Demo Savings', 'bank', '100000')),
  tests.lchange('category', :'cat', 'create', tests.category_fields('Demo food')),
  tests.lchange('transaction', :'tx', 'create', tests.tx_fields('expense', :'acc', '2500', jsonb_build_object('categoryId', :'cat')))
) as household \gset

select tests.authenticate_as(:'asha_id');
select throws_ok($$ select app._load_demo(auth.uid(), '[]'::jsonb, 'web') $$, '42501', null, 'the worker is not callable by clients');
select is(app.load_demo_data(:'household'::jsonb, 'web') -> 'loaded',
          '{"account": 1, "category": 1, "transaction": 1}'::jsonb, 'US1 1: loads into empty data and counts what was added');
select is((select categories_start::text from public.user_preferences where user_id = :'asha_id'), 'suggested',
          'FR-006: the start choice is made');
select is((select count(*)::int from public.transactions where user_id = :'asha_id'), 1, 'the records are the user''s own');
select throws_ok(format($$ select app.load_demo_data(%L::jsonb, 'web') $$, :'household'), 'P0001', 'NOT_EMPTY',
                 'FR-004: a second load is refused (at most once)');

-- ---------------------------------------------------------------- all or nothing
select tests.authenticate_as(:'other_id');
select throws_ok(format($$ select app.reset_and_load_demo(%L::jsonb, 'web') $$, jsonb_build_array(
         tests.lchange('account', gen_random_uuid(), 'create', tests.account_fields('Bad', 'bank', '0', '{"colour":"not-a-colour"}')))),
       'P0001', 'DEMO_REJECTED', 'a refused change refuses the whole load');
select is((select count(*)::int from public.accounts where user_id = :'other_id' and name = 'Bad'), 0, 'nothing of the refused load is kept');
select ok((select count(*) from public.transactions where user_id = :'other_id') = 0
          and (select count(*) from public.accounts where user_id = :'other_id') > 0,
          'US3 2: reset and load is one step — the old data is still there');

-- ---------------------------------------------------------------- history and isolation
select tests.as_superuser();
select is((select count(*)::int from public.audit_events where action = 'demo_data_loaded' and target_id = :'asha_id'), 1,
          'FR-011: one demo_data_loaded entry');
select is((select count(*)::int from public.audit_events where target_type = 'transaction' and details ->> 'ownerId' = :'asha_id'), 1,
          'each loaded record is in the history like a push');
select ok((select count(*) from public.accounts where user_id = :'other_id') = 3, 'another user''s data is untouched');
update public.profiles set status = 'disabled' where user_id = :'other_id';
select tests.authenticate_as(:'other_id');
select throws_ok(format($$ select app.load_demo_data(%L::jsonb, 'web') $$, :'household'), 'P0001', 'USER_INACTIVE', 'a disabled user cannot load');
select tests.as_superuser();
select throws_ok($$ select app.load_demo_data('[]'::jsonb, 'web') $$, 'P0001', 'USER_INACTIVE', 'no session, no load');

select * from finish();
rollback;
