-- R4 T044 app.search_transactions — FR-017 (filters, text, roll-up, Uncategorised, count/total, paging, RLS).
begin;
select plan(18);

select tests.as_superuser();
select tests.create_user('tx.search@example.com') as asha_id \gset
select tests.create_user('tx.search.other@example.com') as other_id \gset
select tests.tx_world(:'asha_id') as w \gset
select tests.tx_world(:'other_id') as wo \gset
select (:'w'::jsonb ->> 'bank') as bank, (:'w'::jsonb ->> 'card') as card, (:'w'::jsonb ->> 'cash') as cash,
       (:'w'::jsonb ->> 'salary') as salary, (:'w'::jsonb ->> 'shop') as shop, (:'w'::jsonb ->> 'ravi') as ravi,
       (:'w'::jsonb ->> 'tag') as tag \gset
select gen_random_uuid() as food \gset
select gen_random_uuid() as veg \gset

select tests.authenticate_as(:'other_id');
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create',
         tests.tx_fields('expense', (:'wo'::jsonb ->> 'bank')::uuid, '999', '{"notes":"Bought milk"}')));

select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.lchange('category', :'food', 'create', tests.category_fields('Food')));
select tests.apply1(tests.lchange('category', :'veg', 'create', tests.category_fields('Vegetables', 'expense', :'food')));
-- a: Vegetables at the shop, 01-Oct, tagged     b: Food, 02-Oct, reference "INV-77"
-- c: uncategorised, 03-Oct, notes "Bought milk"   d: salary in, 04-Oct, void
-- e: transfer bank → card, 05-Oct              f: split with a Vegetables line, 06-Oct, cash
-- g: lent to Ravi, 07-Oct
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'bank', '1000',
         jsonb_build_object('date', '2026-10-01', 'categoryId', :'veg', 'payeeId', :'shop', 'tagIds', jsonb_build_array(:'tag')))));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'bank', '2000',
         jsonb_build_object('date', '2026-10-02', 'categoryId', :'food', 'reference', 'INV-77'))));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'bank', '300',
         jsonb_build_object('date', '2026-10-03', 'notes', 'Bought milk'))));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('income', :'bank', '50000',
         jsonb_build_object('date', '2026-10-04', 'categoryId', :'salary', 'status', 'void'))));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('transfer', :'bank', '7000',
         jsonb_build_object('date', '2026-10-05', 'toAccountId', :'card'))));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', :'cash', '400',
         jsonb_build_object('date', '2026-10-06', 'lines', jsonb_build_array(
           jsonb_build_object('id', gen_random_uuid(), 'amountMinor', '100', 'categoryId', :'veg'),
           jsonb_build_object('id', gen_random_uuid(), 'amountMinor', '300', 'personId', :'ravi', 'personAction', 'paid_on_behalf'))))));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('person', :'cash', '5000',
         jsonb_build_object('date', '2026-10-07', 'payeeId', :'ravi', 'personAction', 'lent'))));

create function pg_temp.n(p_filters jsonb) returns int language sql as $$ select (app.search_transactions(p_filters) ->> 'count')::int $$;

-- ---------------------------------------------------------------- text
select is(pg_temp.n('{"text":"milk"}'), 1, 'text matches notes (own rows only: the other user''s "Bought milk" is not found)');
select is(pg_temp.n('{"text":"inv-77"}'), 1, 'text matches the reference');
select is(pg_temp.n(jsonb_build_object('text', (select name from public.payees where id = :'shop'))), 1, 'text matches the payee name');
select is(pg_temp.n('{"text":"vegetab"}'), 2, 'text matches category names, split lines included');

-- ---------------------------------------------------------------- filters
select is(pg_temp.n('{"from":"2026-10-02","to":"2026-10-04"}'), 3, 'date range');
select is(pg_temp.n(jsonb_build_object('accountId', :'card')), 1, 'an account filter includes transfers into it');
select is(pg_temp.n(jsonb_build_object('categoryId', :'food')), 3, 'a category includes its sub-categories and split lines');
select is(pg_temp.n('{"categoryId":"uncategorised"}'), 1, 'Uncategorised');
select is(pg_temp.n(jsonb_build_object('payeeId', :'ravi')), 2, 'a person includes their split shares');
select is(pg_temp.n(jsonb_build_object('tagId', :'tag')), 1, 'tag');
select is(pg_temp.n('{"kinds":["transfer","person"]}'), 2, 'types');
select is(pg_temp.n('{"statuses":["void"]}'), 1, 'status');
select is(pg_temp.n('{"minMinor":"1000","maxMinor":"7000"}'), 4, 'amount range');
select is(pg_temp.n(jsonb_build_object('categoryId', :'food', 'from', '2026-10-02')), 2, 'filters combine');

-- ---------------------------------------------------------------- count, total, paging
select is(app.search_transactions('{}') ->> 'count', '7', 'everything');
-- in − out of counted, transfers out: −1000 −2000 −300 −400 −5000 (salary is void)
select is(app.search_transactions('{}') ->> 'totalMinor', '-8700', 'net total leaves out transfers and void');
select is((with recursive pages(n, rows, next) as (
             select 1, s -> 'rows', s -> 'next' from (select app.search_transactions('{}', null, 3) s) x
             union all
             select p.n + 1, s -> 'rows', s -> 'next' from pages p, lateral (select app.search_transactions('{}', p.next, 3) s) x
              where p.next is not null and jsonb_typeof(p.next) = 'object')
           select count(distinct r ->> 'id')::int from pages, jsonb_array_elements(rows) r), 7,
          'keyset pages of 3 cover all 7 once');
select is((app.search_transactions('{}', null, 3) -> 'rows' -> 0 ->> 'date'), '2026-10-07', 'newest first');

select * from finish();
rollback;
