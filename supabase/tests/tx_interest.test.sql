-- R4 T035 Interest proposals — FR-013, FR-014, US4 1–5 (amounts are checked by the parity vectors).
begin;
select plan(15);

select tests.as_superuser();
select tests.create_user('int.asha@example.com') as asha_id \gset
select tests.create_user('int.ravi@example.com') as other_id \gset
-- Three ended months before the current one.
select (date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '3 months')::date as m1 \gset
select gen_random_uuid() as ravi \gset
select gen_random_uuid() as meera \gset
select gen_random_uuid() as other_person \gset

select tests.authenticate_as(:'asha_id');
select is(tests.outcome(tests.lchange('payee', :'ravi', 'create', jsonb_build_object('name', 'Ravi', 'kind', 'person',
            'openingBalanceMinor', '10000000', 'openingBalanceDate', :'m1', 'interestMode', 'automatic'))), 'applied', 'setup: Ravi, automatic');
select is(tests.outcome(tests.lchange('payee', :'meera', 'create', jsonb_build_object('name', 'Meera', 'kind', 'person',
            'openingBalanceMinor', '10000000', 'openingBalanceDate', :'m1', 'interestMode', 'manual'))), 'applied', 'setup: Meera, manual');
select is(tests.outcome(tests.lchange('person_rate', gen_random_uuid(), 'create',
            jsonb_build_object('payeeId', :'ravi', 'effectiveMonth', :'m1', 'rateE4', 10000))), 'applied', 'a rate from the 1st of a month is added');
select is(tests.outcome(tests.lchange('person_rate', gen_random_uuid(), 'create',
            jsonb_build_object('payeeId', :'ravi', 'effectiveMonth', (:'m1'::date + 14)::text, 'rateE4', 10000))), 'VALIDATION_FAILED',
          'US4 1: a rate from a day other than the 1st is refused');
select is(tests.outcome(tests.lchange('person_rate', gen_random_uuid(), 'create',
            jsonb_build_object('payeeId', :'meera', 'effectiveMonth', :'m1', 'rateE4', 10000))), 'applied', 'setup: Meera''s rate');

select tests.authenticate_as(:'other_id');
select tests.apply1(tests.lchange('payee', :'other_person', 'create', jsonb_build_object('name', 'Other', 'kind', 'person',
            'openingBalanceMinor', '500000', 'openingBalanceDate', :'m1', 'interestMode', 'automatic')));
select tests.apply1(tests.lchange('person_rate', gen_random_uuid(), 'create', jsonb_build_object('payeeId', :'other_person', 'effectiveMonth', :'m1', 'rateE4', 10000)));

-- ---------------------------------------------------------------- proposals
select tests.authenticate_as(:'asha_id');
select throws_ok($$ select app._propose_interest(auth.uid(), '2099-01-01') $$, '42501', null, 'users cannot choose "today" (worker is service_role only)');
select is((app.propose_interest() ->> 'changed')::int, 3, 'US4 2: one proposal for each of the three ended months');
select is((select count(*)::int from public.transactions where payee_id = :'ravi' and generated and not confirmed
            and date = (interest_month + interval '1 month' - interval '1 day')::date), 3,
          'each waits in To confirm, dated the month''s last day');
select is((select count(*)::int from public.transactions where payee_id = :'meera'), 0, 'US4 5: manual interest creates none');
select is((app.propose_interest() ->> 'changed')::int, 0, 'asking again creates nothing more');

-- delete the first, edit the second: neither is recreated nor recomputed; the third follows
select id as p1 from public.transactions where payee_id = :'ravi' and interest_month = :'m1' \gset
select id as p2 from public.transactions where payee_id = :'ravi' and interest_month = (:'m1'::date + interval '1 month')::date \gset
select tests.apply1(tests.lchange('transaction', :'p1', 'delete'));
select tests.apply1(tests.lchange('transaction', :'p2', 'update', '{"amountMinor":"5000","lines":[]}'));
select is((app.propose_interest() ->> 'changed')::int, 1, 'the waiting third month is recomputed');
select ok(not exists (select 1 from public.transactions where payee_id = :'ravi' and interest_month = :'m1' and state = 'active'),
          'US4 3: a deleted proposal is never recreated');
select is((select amount_minor from public.transactions where id = :'p2'), 5000::bigint, 'US4 3: an edited proposal keeps its amount');
-- third month: opening 1,00,000 + 50.00 waiting (edited) → 1% = 1,000.50 → 100050 paise
select is((select amount_minor from public.transactions where payee_id = :'ravi' and interest_month = (:'m1'::date + interval '2 months')::date),
          100050::bigint, 'later months follow the resulting balances');

-- ---------------------------------------------------------------- other users
select tests.as_superuser();
select is((select count(*)::int from public.transactions where user_id = :'other_id'), 0, 'another user''s people get nothing from Asha''s call');

select * from finish();
rollback;
