-- R4 T021, T028, T031, T041 Transaction rules in app.apply_changes (contracts/sync-protocol.md,
-- data-model.md; FR-001 – FR-012, FR-002a, FR-020).
begin;
select plan(54);

select tests.as_superuser();
select tests.create_user('tx.apply@example.com') as asha_id \gset
select tests.tx_world(:'asha_id') as w \gset
select (:'w'::jsonb ->> 'bank') as bank, (:'w'::jsonb ->> 'card') as card, (:'w'::jsonb ->> 'cash') as cash,
       (:'w'::jsonb ->> 'groceries') as groceries, (:'w'::jsonb ->> 'eating') as eating, (:'w'::jsonb ->> 'salary') as salary,
       (:'w'::jsonb ->> 'shop') as shop, (:'w'::jsonb ->> 'ravi') as ravi, (:'w'::jsonb ->> 'meera') as meera,
       (:'w'::jsonb ->> 'tag') as tag \gset
select gen_random_uuid() as t_up \gset
select gen_random_uuid() as t_split \gset

select tests.authenticate_as(:'asha_id');
-- Test-only readers of internal functions and postings (clients cannot call them).
select tests.as_superuser();
create or replace function pg_temp.balance(p uuid) returns bigint language sql security definer as $$ select app.account_balance_minor(p) $$;
create or replace function pg_temp.person(p uuid) returns bigint language sql security definer as $$ select app.person_balance_minor(p) $$;
create or replace function pg_temp.postings(p uuid) returns int language sql security definer as $$ select count(*)::int from private.transaction_postings where transaction_id = p $$;
grant execute on all functions in schema pg_temp to authenticated;
select tests.authenticate_as(:'asha_id');

-- ---------------------------------------------------------------- US1: expense, income, refund (T021)
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('expense', :'bank', '123450', jsonb_build_object('payeeId', :'shop', 'categoryId', :'groceries')))),
          'applied', 'an expense is recorded');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('income', :'bank', '8500000', jsonb_build_object('categoryId', :'salary')))),
          'applied', 'income is recorded');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('refund', :'bank', '50000', jsonb_build_object('categoryId', :'groceries')))),
          'applied', 'a refund against an expense category is recorded');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'bank', '50000'))),
          'applied', 'an uncategorised expense is recorded (clarify Q1)');
select is(pg_temp.balance(:'bank'), (10000000 - 123450 + 8500000 + 50000 - 50000)::bigint, 'the bank balance follows exactly');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'card', '300000'))),
          'applied', 'an expense on a credit card');
select is(pg_temp.balance(:'card'), 2125000::bigint, 'spending on a card raises what is owed');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('expense', :'bank', '100', jsonb_build_object('categoryId', :'salary')))),
          'INVALID_CATEGORY', 'an income category on an expense is refused');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('income', :'bank', '100', jsonb_build_object('categoryId', :'groceries')))),
          'INVALID_CATEGORY', 'an expense category on income is refused');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('expense', :'bank', '100', '{"date":"2026-03-31"}'))),
          'DATE_BEFORE_OPENING', 'a date before the account''s opening date is refused (clarify Q2)');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'bank', '0'))),
          'VALIDATION_FAILED', 'a zero amount is refused');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'bank', '1000000000000'))),
          'VALIDATION_FAILED', 'an amount beyond the maximum is refused');

-- Upcoming and To confirm (FR-002a)
select is(tests.outcome(tests.lchange('transaction', :'t_up', 'create',
            tests.tx_fields('expense', :'bank', '2500000', jsonb_build_object('date', (current_date + 4)::text, 'categoryId', :'groceries')))),
          'applied', 'a future-dated expense is saved');
select is((select confirmed from public.transactions where id = :'t_up'), false, 'it is upcoming (not confirmed)');
select is(pg_temp.balance(:'bank'), (10000000 - 123450 + 8500000)::bigint, 'an upcoming transaction counts nowhere');
select is(tests.outcome(tests.lchange('transaction', :'t_up', 'update', '{"confirmed":true}')), 'applied', 'confirming early is accepted…');
select is((select confirmed from public.transactions where id = :'t_up'), false, '…but it stays upcoming until its date');
select is(tests.outcome(tests.lchange('transaction', :'t_up', 'update', jsonb_build_object('date', current_date::text))), 'applied',
          'moving it to today…');
select is(tests.outcome(tests.lchange('transaction', :'t_up', 'update', '{"confirmed":true}')), 'applied', '…and confirming it');
select is(pg_temp.balance(:'bank'), (10000000 - 123450 + 8500000 - 2500000)::bigint, 'a confirmed transaction counts from its date');
select is(tests.outcome(tests.lchange('transaction', :'t_up', 'update', jsonb_build_object('date', (current_date + 2)::text))), 'applied',
          'moving a confirmed transaction to the future…');
select is((select confirmed from public.transactions where id = :'t_up'), false, '…makes it upcoming again');

-- Void and delete
select is(tests.outcome(tests.lchange('transaction', :'t_up', 'update', jsonb_build_object('date', current_date::text, 'confirmed', true, 'status', 'void'))),
          'applied', 'a transaction can be voided');
select is(pg_temp.balance(:'bank'), (10000000 - 123450 + 8500000)::bigint, 'a void transaction counts nowhere');

-- Archived accounts
select tests.apply1(tests.lchange('account', gen_random_uuid(), 'create', tests.account_fields('Old', 'cash', '0', '{"icon":"coins"}')));
select id as old_acc from public.accounts where name = 'Old' \gset
select tests.apply1(tests.lchange('account', :'old_acc', 'archive'));
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'old_acc', '100'))),
          'ACCOUNT_INACTIVE', 'an archived account is refused for a new transaction');

-- ---------------------------------------------------------------- US2: transfers (T028)
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('transfer', :'bank', '1825000', jsonb_build_object('toAccountId', :'card')))),
          'applied', 'a transfer pays the card');
select is(pg_temp.balance(:'card'), 300000::bigint, 'the card owes less by the transfer');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('transfer', :'bank', '100', jsonb_build_object('toAccountId', :'bank')))),
          'VALIDATION_FAILED', 'a transfer to the same account is refused');

-- ---------------------------------------------------------------- US3: people (T031)
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('person', :'cash', '500000', jsonb_build_object('payeeId', :'ravi', 'personAction', 'lent')))),
          'applied', 'lent to Ravi');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('person', :'bank', '800000', jsonb_build_object('payeeId', :'ravi', 'personAction', 'received_back')))),
          'applied', 'received back from Ravi');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('person', :'bank', '250000', jsonb_build_object('payeeId', :'ravi', 'personAction', 'paid_on_behalf')))),
          'applied', 'paid on Ravi''s behalf');
select is(pg_temp.person(:'ravi'), (1500000 + 500000 - 800000 + 250000)::bigint, 'Ravi''s balance follows');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('person', :'bank', '900000', jsonb_build_object('payeeId', :'meera', 'personAction', 'repaid_to')))),
          'applied', 'repaid Meera more than was owed');
select is(pg_temp.person(:'meera'), 450000::bigint, 'the balance flips: Meera now owes the user');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('person', null, '100000', jsonb_build_object('payeeId', :'ravi', 'personAction', 'adjustment', 'flow', 'in', 'notes', 'Forgave part')))),
          'applied', 'an adjustment with a reason needs no account');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('person', null, '100000', jsonb_build_object('payeeId', :'ravi', 'personAction', 'adjustment', 'flow', 'in')))),
          'VALIDATION_FAILED', 'an adjustment without a reason is refused');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('person', :'bank', '100', jsonb_build_object('payeeId', :'shop', 'personAction', 'lent')))),
          'INVALID_PERSON', 'a business cannot be lent to');
select is(tests.outcome(tests.lchange('payee', :'ravi', 'update', '{"kind":"business"}')), 'BALANCE_NOT_ZERO',
          'a person with a balance cannot become a business');
-- Movements that net to zero still make a person's history: they stay a person.
select gen_random_uuid() as anil \gset
select tests.apply1(tests.lchange('payee', :'anil', 'create', tests.person_fields('Anil', '0')));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('person', :'cash', '1000', jsonb_build_object('payeeId', :'anil', 'personAction', 'lent'))));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('person', :'cash', '1000', jsonb_build_object('payeeId', :'anil', 'personAction', 'received_back'))));
select is(tests.outcome(tests.lchange('payee', :'anil', 'update', '{"kind":"business"}')), 'INVALID_PERSON',
          'a settled person with movements cannot become a business');

-- ---------------------------------------------------------------- US5: splits (T041)
select is(tests.outcome(tests.lchange('transaction', :'t_split', 'create',
            tests.tx_fields('expense', :'bank', '300000', jsonb_build_object('lines', jsonb_build_array(
              jsonb_build_object('id', gen_random_uuid(), 'amountMinor', '100000', 'categoryId', :'eating'),
              jsonb_build_object('id', gen_random_uuid(), 'amountMinor', '200000', 'personId', :'meera', 'personAction', 'paid_on_behalf')))))),
          'applied', 'a split with a person share');
select is(pg_temp.person(:'meera'), 650000::bigint, 'the share is added to what Meera owes');
select is(pg_temp.postings(:'t_split'), 3,
          'one account posting and one posting per line');
select is(tests.outcome(tests.lchange('transaction', :'t_split', 'update', jsonb_build_object('amountMinor', '300001', 'lines',
            (select lines from public.transactions where id = :'t_split')))),
          'LINES_MISMATCH', 'lines that do not add up are refused');
select is(tests.outcome(tests.lchange('transaction', :'t_split', 'update', '{"amountMinor":"300000"}')), 'VALIDATION_FAILED',
          'the amount cannot change without the lines');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('expense', :'bank', '100', jsonb_build_object('lines', jsonb_build_array(
              jsonb_build_object('id', gen_random_uuid(), 'amountMinor', '100', 'categoryId', :'eating')))))),
          'VALIDATION_FAILED', 'a one-line split is refused');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('expense', :'bank', '200', jsonb_build_object('lines', jsonb_build_array(
              jsonb_build_object('id', gen_random_uuid(), 'amountMinor', '100', 'categoryId', :'salary'),
              jsonb_build_object('id', gen_random_uuid(), 'amountMinor', '100', 'categoryId', :'eating')))))),
          'INVALID_CATEGORY', 'a line of the other kind is refused');

-- ---------------------------------------------------------------- activity (FR-021)
select is(tests.outcome(tests.lchange('category', :'groceries', 'delete')), 'HAS_ACTIVITY', 'a used category cannot be deleted');
select is(tests.outcome(tests.lchange('payee', :'shop', 'delete')), 'HAS_ACTIVITY', 'a used payee cannot be deleted');

-- ---------------------------------------------------------------- interest setting on payees (FR-013)
select gen_random_uuid() as p_int \gset
select is(tests.outcome(tests.lchange('payee', :'p_int', 'create', jsonb_build_object('name', 'Interest Friend', 'kind', 'person',
            'openingBalanceDate', '2026-04-01', 'interestMode', 'automatic'))), 'applied', 'a person can be created with an interest setting');
select is((select interest_mode::text from public.payees where id = :'p_int'), 'automatic', 'the setting is stored');
select is(tests.outcome(tests.lchange('payee', gen_random_uuid(), 'create', jsonb_build_object('name', 'New Shop', 'kind', 'business',
            'interestMode', 'none'))), 'applied', 'a business created with interestMode none is accepted');
select is(tests.outcome(tests.lchange('payee', gen_random_uuid(), 'create', jsonb_build_object('name', 'Interest Shop', 'kind', 'business',
            'interestMode', 'automatic'))), 'VALIDATION_FAILED', 'a business cannot charge interest');
select is(tests.outcome(tests.lchange('payee', :'p_int', 'update', '{"kind":"business"}')), 'applied', 'a settled person becomes a business');
select is((select interest_mode::text from public.payees where id = :'p_int'), 'none', 'and their interest setting goes back to none');

select * from finish();
rollback;
