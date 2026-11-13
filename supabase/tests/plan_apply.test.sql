-- R7 T009 Writes for plan items and item months (contracts/sync-protocol.md; research R7-01, R7-02).
begin;
select plan(31);

select tests.as_superuser();
select tests.create_user('plan.apply@example.com') as uid \gset
select tests.tx_world(:'uid') as w \gset
select (:'w'::jsonb ->> 'bank') as bank, (:'w'::jsonb ->> 'card') as card, (:'w'::jsonb ->> 'shop') as shop,
       (:'w'::jsonb ->> 'ravi') as ravi, (:'w'::jsonb ->> 'groceries') as groceries, (:'w'::jsonb ->> 'salary') as salary \gset
select gen_random_uuid() as rent, gen_random_uuid() as bill, gen_random_uuid() as old, gen_random_uuid() as late,
       gen_random_uuid() as linked, gen_random_uuid() as tx \gset
select tests.authenticate_as(:'uid');

-- ---------------------------------------------------------------- create and replay
select is(tests.outcome(tests.lchange('plan_item', :'rent', 'create',
            tests.plan_fields('Rent', :'shop', :'bank', '2500000', null, jsonb_build_object('categoryId', :'groceries')))),
          'applied', 'a monthly payment to a business is created');
select is((select terms -> 0 ->> 'amountMinor' from public.plan_items where id = :'rent'), '2500000',
          'its terms are stored with the amount as a decimal string');
select is(tests.outcome(tests.lchange('plan_item', :'rent', 'create',
            tests.plan_fields('House rent', :'shop', :'bank'))), 'applied',
          'a create replayed for an existing item merges as an update');
select is((select name from public.plan_items where id = :'rent'), 'House rent', 'the replayed create renamed it');

-- ---------------------------------------------------------------- item checks (INVALID_PLAN_ITEM)
select is(tests.outcome(tests.lchange('plan_item', gen_random_uuid(), 'create',
            tests.plan_fields('X', :'shop', :'bank', '100', null, jsonb_build_object('cardAccountId', :'card')))),
          'INVALID_PLAN_ITEM', 'a payment to a payee cannot also name a card');
select is(tests.outcome(tests.lchange('plan_item', gen_random_uuid(), 'create',
            tests.plan_fields('X', :'ravi', :'bank'))), 'INVALID_PLAN_ITEM', 'a payment to a business needs a business payee');
select is(tests.outcome(tests.lchange('plan_item', gen_random_uuid(), 'create',
            tests.plan_fields('X', :'shop', :'bank', '100', null, jsonb_build_object('categoryId', :'salary')))),
          'INVALID_PLAN_ITEM', 'the category must be an expense category');
select is(tests.outcome(tests.lchange('plan_item', :'bill', 'create',
            tests.plan_fields('Card bill', null, :'card', null, null,
                              jsonb_build_object('target', 'card', 'cardAccountId', :'card', 'payeeId', null, 'amountVaries', true)))),
          'INVALID_PLAN_ITEM', 'a card bill is not paid from the card itself');
select is(tests.outcome(tests.lchange('plan_item', :'bill', 'create',
            tests.plan_fields('Card bill', null, :'bank', null, null,
                              jsonb_build_object('target', 'card', 'cardAccountId', :'card', 'payeeId', null, 'amountVaries', true)))),
          'applied', 'a card bill without a usual amount is created');
select is(tests.outcome(tests.lchange('plan_item', gen_random_uuid(), 'create',
            tests.plan_fields('X', :'shop', :'bank', null))), 'INVALID_PLAN_ITEM',
          'a fixed payment needs its amount');
select is(tests.outcome(tests.lchange('plan_item', gen_random_uuid(), 'create',
            tests.plan_fields('X', :'shop', :'bank', '100', null, jsonb_build_object('terms', jsonb_build_array(
              tests.term(tests.month(0), '100', 5, :'bank'::uuid), tests.term(tests.month(0), '200', 5, :'bank'::uuid)))))),
          'INVALID_PLAN_ITEM', 'terms must be in month order');
select is(tests.outcome(tests.lchange('plan_item', gen_random_uuid(), 'create',
            tests.plan_fields('X', :'shop', :'bank', '100', null, jsonb_build_object('terms', jsonb_build_array(
              tests.term(tests.month(1), '100', 5, :'bank'::uuid)))))),
          'INVALID_PLAN_ITEM', 'the first term starts in the start month');
select is(tests.outcome(tests.lchange('plan_item', gen_random_uuid(), 'create',
            tests.plan_fields('X', :'shop', :'bank', '100', null, '{"frequency":"every_n_months","intervalMonths":1}'))),
          'VALIDATION_FAILED', 'every N months needs N from 2 to 12');
select is(tests.outcome(tests.lchange('plan_item', :'rent', 'update', '{"target":"card"}')), 'VALIDATION_FAILED',
          'what an item pays for never changes kind');

-- ---------------------------------------------------------------- terms from a month (FR-008, TERMS_IN_PAST)
select tests.apply1(tests.hchange('plan_item', :'old', 'create',
         tests.plan_fields('School bus', :'shop', :'bank', '300000', tests.month(-2)), tests.hlc_at(-3)));
select is(tests.outcome(tests.lchange('plan_item', :'old', 'update', jsonb_build_object('terms', jsonb_build_array(
            tests.term(tests.month(-2), '350000', 5, :'bank'::uuid))))),
          'TERMS_IN_PAST', 'changing what an earlier month showed is refused');
select is(tests.outcome(tests.lchange('plan_item', :'old', 'update', jsonb_build_object('terms', jsonb_build_array(
            tests.term(tests.month(-2), '300000', 5, :'bank'::uuid), tests.term(tests.month(0), '350000', 7, :'bank'::uuid))))),
          'applied', 'an edit from the current month is accepted');
select is(tests.outcome(tests.lchange('plan_item', :'old', 'update', jsonb_build_object('terms', jsonb_build_array(
            tests.term(tests.month(-2), '300000', 5, :'bank'::uuid), tests.term(tests.month(0), '350000', 7, :'bank'::uuid),
            tests.term(tests.month(2), '400000', 7, :'bank'::uuid))))),
          'applied', 'an edit from a later month is accepted');

select tests.apply1(tests.hchange('plan_item', :'late', 'create',
         tests.plan_fields('Milk', :'shop', :'bank', '100000', tests.month(-3)), tests.hlc_at(-3, 60)));
select is(tests.outcome(tests.hchange('plan_item', :'late', 'update', jsonb_build_object('terms', jsonb_build_array(
            tests.term(tests.month(-3), '100000', 5, :'bank'::uuid), tests.term(tests.month(-1), '120000', 5, :'bank'::uuid))),
            tests.hlc_at(0, -30))),
          'applied', 'an edit made offline on the last day of last month is accepted after midnight');
select is(tests.outcome(tests.hchange('plan_item', :'late', 'update', jsonb_build_object('terms', jsonb_build_array(
            tests.term(tests.month(-3), '100000', 5, :'bank'::uuid), tests.term(tests.month(-2), '110000', 5, :'bank'::uuid))),
            tests.hlc_at(0, -20))),
          'TERMS_IN_PAST', 'but not one changing a month before that');

-- ---------------------------------------------------------------- months with payments (HAS_PAYMENTS)
select tests.apply1(tests.lchange('plan_item', :'linked', 'create', tests.plan_fields('EMI', :'shop', :'bank', '4250000', tests.month(-2))));
select tests.apply1(tests.lchange('transaction', :'tx', 'create', tests.tx_fields('expense', :'bank'::uuid, '4250000',
         jsonb_build_object('date', to_char(now(), 'YYYY-MM-DD')))));
select tests.as_superuser();
update public.transactions set plan_item_id = :'linked', plan_month = tests.month(0)::date where id = :'tx';
select tests.authenticate_as(:'uid');
select is(tests.outcome(tests.lchange('plan_item', :'linked', 'update', jsonb_build_object('endMonth', tests.month(-1)))),
          'HAS_PAYMENTS', 'ending an item before a paid month is refused');
select is(tests.outcome(tests.lchange('plan_item', :'linked', 'update', '{"frequency":"every_n_months","intervalMonths":3}')),
          'HAS_PAYMENTS', 'a new frequency that drops a paid month is refused');
select is(tests.outcome(tests.lchange('plan_item', :'linked', 'update', jsonb_build_object('endMonth', tests.month(0)))),
          'applied', 'ending it after its paid months is accepted');

-- ---------------------------------------------------------------- item months (R7-02)
select is(tests.outcome(tests.lchange('plan_occurrence', gen_random_uuid(), 'create',
            jsonb_build_object('itemId', :'rent', 'month', tests.month(0), 'amountMinor', '2600000'))),
          'INVALID_OCCURRENCE', 'an item month''s id must be derived from the item and month');
select is(tests.outcome(tests.lchange('plan_occurrence', app._plan_occurrence_id(:'rent', tests.month(-1)::date), 'create',
            jsonb_build_object('itemId', :'rent', 'month', tests.month(-1), 'amountMinor', '2600000'))),
          'INVALID_OCCURRENCE', 'a month the item does not have is refused');
select is(tests.outcome(tests.hchange('plan_occurrence', app._plan_occurrence_id(:'rent', tests.month(1)::date), 'create',
            jsonb_build_object('itemId', :'rent', 'month', tests.month(1), 'amountMinor', '2600000'), tests.hlc_at(0, 1))),
          'applied', 'one device sets next month''s amount');
select is(tests.outcome(tests.hchange('plan_occurrence', app._plan_occurrence_id(:'rent', tests.month(1)::date), 'create',
            jsonb_build_object('itemId', :'rent', 'month', tests.month(1), 'skipped', true), tests.hlc_at(0, 2))),
          'applied', 'another device creates the same month offline');
select is((select count(*)::int || ' ' || max(amount_minor)::text || ' ' || bool_and(skipped)::text
             from public.plan_occurrences where item_id = :'rent'), '1 2600000 true',
          'both creates merged per field into one row');
select is((tests.apply1(tests.hchange('plan_occurrence', app._plan_occurrence_id(:'rent', tests.month(1)::date), 'update',
            '{"amountMinor":"1"}', tests.hlc_at(0))) -> 'ignoredFields'), '["amountMinor"]'::jsonb,
          'an older edit loses to the newer one (latest wins)');

-- ---------------------------------------------------------------- delete, history
select is(tests.outcome(tests.lchange('plan_item', :'rent', 'delete')), 'applied', 'an item is deleted');
select is(tests.outcome(tests.lchange('plan_occurrence', app._plan_occurrence_id(:'rent', tests.month(1)::date), 'update',
            '{"skipped":false}')), 'INVALID_OCCURRENCE', 'a deleted item''s months cannot change');
select tests.as_superuser();
select is((select array_agg(distinct action::text order by action::text) from public.audit_events
            where target_type in ('plan_item', 'plan_month') and details ->> 'ownerId' = :'uid'),
          array['plan_item_created', 'plan_item_deleted', 'plan_item_edited', 'plan_month_created', 'plan_month_edited'],
          'history records items created, edited and deleted and months set');

select * from finish();
rollback;
