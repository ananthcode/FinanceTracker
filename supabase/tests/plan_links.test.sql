-- R7 T011 Payment links on transactions (research R7-03) and merges reaching plan items (R7-12).
begin;
select plan(23);

select tests.as_superuser();
select tests.create_user('plan.links@example.com') as uid \gset
select tests.create_user('plan.other@example.com') as other \gset
select tests.tx_world(:'uid') as w \gset
select tests.tx_world(:'other') as wo \gset
select (:'w'::jsonb ->> 'bank') as bank, (:'w'::jsonb ->> 'card') as card, (:'w'::jsonb ->> 'shop') as shop,
       (:'w'::jsonb ->> 'ravi') as ravi, (:'w'::jsonb ->> 'groceries') as groceries, (:'w'::jsonb ->> 'eating') as eating \gset
select gen_random_uuid() as rent, gen_random_uuid() as gone, gen_random_uuid() as theirs, gen_random_uuid() as mart2,
       gen_random_uuid() as t1, gen_random_uuid() as t2, gen_random_uuid() as t3 \gset

create or replace function pg_temp.link(p_item uuid, p_month text)
returns jsonb language sql immutable as $$ select jsonb_build_object('planItemId', p_item, 'planMonth', p_month) $$;
create or replace function pg_temp.today() returns text language sql stable as $$ select to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD') $$;

select tests.authenticate_as(:'other');
select tests.apply1(tests.lchange('plan_item', :'theirs', 'create',
         tests.plan_fields('Rent', (:'wo'::jsonb ->> 'shop')::uuid, (:'wo'::jsonb ->> 'bank')::uuid)));

select tests.authenticate_as(:'uid');
select tests.apply1(tests.lchange('payee', :'mart2', 'create', tests.business_fields('Mart Two')));
select tests.apply1(tests.lchange('plan_item', :'rent', 'create',
         tests.plan_fields('Rent', :'mart2', :'bank', '2500000', tests.month(-1), jsonb_build_object('categoryId', :'groceries'))));
select tests.apply1(tests.lchange('plan_item', :'gone', 'create', tests.plan_fields('Gym', :'shop', :'bank', '150000')));
select tests.apply1(tests.lchange('plan_item', :'gone', 'delete'));

-- ---------------------------------------------------------------- linking
select is(tests.outcome(tests.lchange('transaction', :'t1', 'create',
            tests.tx_fields('expense', :'bank'::uuid, '1000000', jsonb_build_object('date', pg_temp.today()) || pg_temp.link(:'rent', tests.month(0))))),
          'applied', 'a new expense can pay an item-month');
select is((select plan_item_id::text || ' ' || plan_month::text from public.transactions where id = :'t1'), :'rent' || ' ' || tests.month(0),
          'the link is stored on the transaction');
select is(tests.outcome(tests.lchange('transaction', :'t2', 'create',
            tests.tx_fields('expense', :'bank'::uuid, '1500000', jsonb_build_object('date', pg_temp.today()) || pg_temp.link(:'rent', tests.month(0))))),
          'applied', 'several transactions can pay one item-month (part payments)');
select ok((select field_versions ? 'plan' and not (field_versions ? 'planItemId') from public.transactions where id = :'t1'),
          'both link fields share one field version, "plan"');
select is(tests.outcome(tests.lchange('transaction', :'t3', 'create',
            tests.tx_fields('transfer', :'bank'::uuid, '500000', jsonb_build_object('date', pg_temp.today(), 'toAccountId', :'card')
                            || pg_temp.link(:'rent', tests.month(-1))))),
          'applied', 'a transfer (a card bill payment) can pay an item-month');

-- ---------------------------------------------------------------- refused links (INVALID_PLAN_LINK)
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('expense', :'bank'::uuid, '100', pg_temp.link(:'theirs', tests.month(0))))),
          'INVALID_PLAN_LINK', 'another user''s item is refused');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('expense', :'bank'::uuid, '100', pg_temp.link(:'gone', tests.month(0))))),
          'INVALID_PLAN_LINK', 'a deleted item is refused');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('expense', :'bank'::uuid, '100', pg_temp.link(:'rent', tests.month(-2))))),
          'INVALID_PLAN_LINK', 'a month the item does not have is refused');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('income', :'bank'::uuid, '100', pg_temp.link(:'rent', tests.month(0))))),
          'INVALID_PLAN_LINK', 'income cannot pay a planned payment');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('refund', :'bank'::uuid, '100', pg_temp.link(:'rent', tests.month(0))))),
          'INVALID_PLAN_LINK', 'nor can a refund');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('person', :'bank'::uuid, '100', jsonb_build_object('payeeId', :'ravi', 'personAction', 'received_back')
                            || pg_temp.link(:'rent', tests.month(0))))),
          'INVALID_PLAN_LINK', 'nor money in from a person');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('person', :'bank'::uuid, '100', jsonb_build_object('payeeId', :'ravi', 'personAction', 'repaid_to')
                            || pg_temp.link(:'rent', tests.month(0))))),
          'applied', 'a repayment to a person can');
select is(tests.outcome(tests.lchange('transaction', gen_random_uuid(), 'create',
            tests.tx_fields('expense', :'bank'::uuid, '100', jsonb_build_object('planItemId', :'rent')))),
          'INVALID_PLAN_LINK', 'the item and the month are sent together');

-- ---------------------------------------------------------------- unlink, relink, delete, void
select is(tests.outcome(tests.lchange('transaction', :'t2', 'update', '{"planItemId":null,"planMonth":null}')), 'applied',
          'a transaction is unlinked');
select is((select plan_item_id is null and amount_minor = 1500000 and kind = 'expense' from public.transactions where id = :'t2'), true,
          'unlinking leaves the transaction otherwise unchanged');
select is(tests.outcome(tests.lchange('transaction', :'t2', 'update', pg_temp.link(:'rent', tests.month(0)))), 'applied',
          'and linked again');
select tests.apply1(tests.lchange('transaction', :'t2', 'update', '{"status":"void"}'));
select tests.apply1(tests.lchange('transaction', :'t1', 'delete'));
select is((select count(*)::int from public.transactions where id in (:'t1', :'t2') and plan_item_id = :'rent'), 2,
          'voiding or deleting a linked transaction keeps its link fields (the plan stops counting it)');
select tests.apply1(tests.lchange('plan_item', :'rent', 'delete'));
select is(tests.outcome(tests.lchange('transaction', :'t3', 'update', '{"notes":"October bill"}')), 'applied',
          'a kept link survives the item''s deletion: the transaction can still be edited');

-- ---------------------------------------------------------------- merges reach plan items (R7-12)
select tests.apply1(tests.lchange('plan_item', gen_random_uuid(), 'create',
         tests.plan_fields('Groceries plan', :'mart2', :'bank', '800000', null, jsonb_build_object('categoryId', :'groceries'))));
select is(tests.outcome(tests.lchange('payee', :'mart2', 'merge', jsonb_build_object('targetId', :'shop'))), 'applied',
          'a payee used by plan items is merged');
select is((select count(*)::int from public.plan_items where payee_id = :'mart2'), 0, 'no plan item points at the merged payee');
select is((select count(*)::int from public.plan_items where payee_id = :'shop' and field_versions ? 'payeeId' and name = 'Groceries plan'), 1,
          'the plan item follows the merge, with its field version bumped');
select is(tests.outcome(tests.lchange('category', :'groceries', 'relocate', jsonb_build_object('targetId', :'eating'))), 'applied',
          'a category is relocated');
select is((select count(*)::int from public.plan_items where category_id = :'eating'), 2,
          'plan items follow the relocated category');

select * from finish();
rollback;
