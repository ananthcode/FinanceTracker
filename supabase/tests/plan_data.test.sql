-- R7 T013 Pull, reset, demo load and erasure of the plan (contracts/sync-protocol.md §Pull; R7-12).
begin;
select plan(12);

select tests.as_superuser();
select tests.create_user('plan.data@example.com') as uid \gset
select tests.create_user('plan.gone@example.com') as gone \gset
select tests.tx_world(:'uid') as w \gset
select tests.tx_world(:'gone') as wg \gset
select (:'w'::jsonb ->> 'bank') as bank, (:'w'::jsonb ->> 'shop') as shop \gset
select gen_random_uuid() as rent, gen_random_uuid() as gym, gen_random_uuid() as tx, gen_random_uuid() as gitem \gset

select tests.authenticate_as(:'uid');
select tests.apply1(tests.lchange('plan_item', :'rent', 'create', tests.plan_fields('Rent', :'shop', :'bank')));
select tests.apply1(tests.lchange('plan_item', :'gym', 'create', tests.plan_fields('Gym', :'shop', :'bank', '150000')));
select tests.apply1(tests.lchange('plan_item', :'gym', 'delete'));
select tests.apply1(tests.lchange('plan_occurrence', app._plan_occurrence_id(:'rent', tests.month(1)::date), 'create',
         jsonb_build_object('itemId', :'rent', 'month', tests.month(1), 'skipped', true)));
select tests.apply1(tests.lchange('transaction', :'tx', 'create', tests.tx_fields('expense', :'bank'::uuid, '2500000',
         jsonb_build_object('planItemId', :'rent', 'planMonth', tests.month(0)))));
update public.user_preferences set plan_nudge = false, plan_checked_month = tests.month(1)::date where user_id = :'uid';

-- ---------------------------------------------------------------- pull
select is(jsonb_array_length(app.pull_changes(0) -> 'rows' -> 'plan_item'), 2, 'pull returns plan items, deleted ones included');
select is((app.pull_changes(0) -> 'rows' -> 'plan_occurrence' -> 0 ->> 'skipped'), 'true', 'pull returns item months');
select is((select r ->> 'plan_item_id' from jsonb_array_elements(app.pull_changes(0) -> 'rows' -> 'transaction') r
            where r ->> 'id' = :'tx'), :'rent', 'pulled transactions carry their link');
select is((app.pull_changes(0) -> 'rows' -> 'plan_item' -> 0 -> 'terms' -> 0 ->> 'amountMinor') is not null, true,
          'pulled items carry their terms');

-- ---------------------------------------------------------------- demo load needs empty data
select tests.as_superuser();
select throws_ok(format($$ select app._load_demo(%L, '[{"x":1}]'::jsonb, 'web') $$, :'uid'), 'P0001', 'NOT_EMPTY',
                 'the demo household loads only into empty data (a plan counts)');
select tests.authenticate_as(:'uid');

-- ---------------------------------------------------------------- reset (R5)
select is((app.reset_my_data('web') -> 'removed' ->> 'planItems')::int, 2, 'reset removes the plan items');
select is((select count(*)::int from public.plan_items) + (select count(*)::int from public.plan_occurrences), 0,
          'and their months');
select is((select coalesce(plan_checked_month::text, 'none') || ' ' || plan_nudge::text from public.user_preferences),
          'none false', 'reset clears the checked month and keeps the reminder setting');
select tests.as_superuser();
select is((select count(*)::int from public.audit_events where target_type in ('plan_item', 'plan_month')
             and details ->> 'ownerId' = :'uid'), 0, 'reset deletes the plan''s history');

-- ---------------------------------------------------------------- erasure
select tests.authenticate_as(:'gone');
select tests.apply1(tests.lchange('plan_item', :'gitem', 'create',
         tests.plan_fields('Rent', (:'wg'::jsonb ->> 'shop')::uuid, (:'wg'::jsonb ->> 'bank')::uuid)));
select tests.apply1(tests.lchange('transaction', gen_random_uuid(), 'create', tests.tx_fields('expense', (:'wg'::jsonb ->> 'bank')::uuid, '100',
         jsonb_build_object('planItemId', :'gitem', 'planMonth', tests.month(0)))));
select tests.as_superuser();
select is((select count(*)::int from public.audit_events where target_type = 'plan_item' and details ->> 'ownerId' = :'gone'), 1,
          'the plan has history before erasure');
select app.scrub_user_from_audit(:'gone', 'plan.gone@example.com');
delete from auth.users where id = :'gone';
select is((select count(*)::int from public.plan_items where user_id = :'gone')
        + (select count(*)::int from public.plan_occurrences where user_id = :'gone')
        + (select count(*)::int from public.transactions where user_id = :'gone'), 0,
          'erasure leaves no plan item, item month or linked transaction');
select is((select count(*)::int from public.audit_events where target_type in ('plan_item', 'plan_month')
             and details ->> 'ownerId' = :'gone'), 0, 'nor any plan history');

select * from finish();
rollback;
