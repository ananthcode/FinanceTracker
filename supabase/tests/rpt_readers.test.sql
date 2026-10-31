-- R6 T006 Report readers and fields — contracts/database.md rules 1–3 (FR-005 – FR-007, FR-010).
-- Amounts and roll-ups are checked against core by the parity test; here access and rules.
begin;
select plan(14);

select tests.as_superuser();
select tests.create_user('rpt.asha@example.com') as asha_id \gset
select tests.create_user('rpt.other@example.com') as other_id \gset
select tests.tx_world(:'other_id') as wo \gset
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create',
         tests.tx_fields('expense', (:'wo'::jsonb ->> 'bank')::uuid, '999999', jsonb_build_object('date', '2026-10-05'))));
select tests.tx_world(:'asha_id') as w \gset
select (:'w'::jsonb ->> 'bank') as bank, (:'w'::jsonb ->> 'groceries') as groceries, (:'w'::jsonb ->> 'salary') as salary,
       (:'w'::jsonb ->> 'shop') as shop, (:'w'::jsonb ->> 'ravi') as ravi \gset
select gen_random_uuid() as veg \gset
select tests.apply1(tests.lchange('category', :'veg', 'create', tests.category_fields('Veg', 'expense', :'groceries')));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'bank', '1000',
         jsonb_build_object('date', '2026-10-03', 'categoryId', :'groceries', 'payeeId', :'shop'))));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'bank', '300',
         jsonb_build_object('date', '2026-10-04', 'categoryId', :'veg'))));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('refund', :'bank', '200',
         jsonb_build_object('date', '2026-10-05', 'categoryId', :'groceries', 'payeeId', :'shop'))));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('income', :'bank', '5000',
         jsonb_build_object('date', '2026-09-30', 'categoryId', :'salary'))));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'bank', '77',
         jsonb_build_object('date', '2026-10-06', 'categoryId', :'groceries', 'status', 'void'))));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('person', :'bank', '4000',
         jsonb_build_object('date', '2026-10-07', 'payeeId', :'ravi', 'personAction', 'lent'))));

-- ---------------------------------------------------------------- category / payee totals
select tests.authenticate_as(:'asha_id');
select is(jsonb_array_length(app.category_payee_totals('2026-10-01', '2026-10-31')), 2, 'two non-zero groups in October');
select is((select x ->> 'totalMinor' from jsonb_array_elements(app.category_payee_totals('2026-10-01', '2026-10-31')) x
            where x ->> 'categoryId' = :'groceries' and x ->> 'payeeId' = :'shop'), '800', 'a refund reduces its category (void left out)');
select is((select x ->> 'totalMinor' from jsonb_array_elements(app.category_payee_totals('2026-10-01', '2026-10-31')) x
            where x ->> 'categoryId' = :'veg' and x -> 'payeeId' = 'null'::jsonb), '300', 'a sub-category with no payee has its own row');
select ok(not exists (select 1 from jsonb_array_elements(app.category_payee_totals('2026-01-01', '2026-12-31')) x
                      where x ->> 'totalMinor' = '999999'), 'another user''s spending never appears');
select ok(not exists (select 1 from jsonb_array_elements(app.category_payee_totals('2026-10-01', '2026-10-31')) x
                      where x ->> 'totalMinor' = '4000'), 'lending is in no category total');

-- ---------------------------------------------------------------- month totals
select is(app.month_totals('2026-09-01', '2026-10-31'),
          '[{"month": "2026-09-01", "incomeMinor": "5000", "spendingMinor": "0"},
            {"month": "2026-10-01", "incomeMinor": "0", "spendingMinor": "1100"}]'::jsonb, 'income and spending per month');
select throws_ok($$ select app.month_totals('2026-10-31', '2026-10-01') $$, 'P0001', 'VALIDATION_FAILED', 'a backwards range is refused');
select throws_ok($$ select app.category_payee_totals('2000-01-01', '2026-10-01') $$, 'P0001', 'VALIDATION_FAILED', 'a range over ten years is refused');

-- ---------------------------------------------------------------- the last drill level (search)
select is((app.search_transactions(jsonb_build_object('categoryId', :'groceries')) ->> 'count')::int, 4,
          'a category includes its sub-categories');
select is((app.search_transactions(jsonb_build_object('categoryId', :'groceries', 'categoryExact', true)) ->> 'count')::int, 3,
          'categoryExact: the category itself only (void counted in the list, as R4)');
select is((app.search_transactions(jsonb_build_object('categoryId', :'veg', 'payeeId', 'none')) ->> 'count')::int, 1,
          'payeeId none: transactions without a payee');

-- ---------------------------------------------------------------- the statement sign (synced payee field)
select is(tests.outcome(tests.lchange('payee', :'ravi', 'update', '{"statementSign":"i_owe_positive"}')), 'applied', 'the sign can be set');
select is((select statement_sign::text from public.payees where id = :'ravi'), 'i_owe_positive', 'and is stored');
select tests.as_superuser();
select throws_ok(format($$ select app.category_payee_totals('2026-10-01', '2026-10-31') $$), 'P0001', 'USER_INACTIVE', 'no session, no totals');

select * from finish();
rollback;
