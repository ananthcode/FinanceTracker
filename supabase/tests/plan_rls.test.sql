-- R7 T009 Plan access rules: own data only (constitution I; contracts/sync-protocol.md).
begin;
select plan(18);

select tests.as_superuser();
update public.profiles set role = 'member' where role = 'owner';
select tests.create_user('plan.owner@example.com', 'owner') as owner_id \gset
select tests.create_user('plan.asha@example.com') as asha_id \gset
select tests.create_user('plan.ravi@example.com') as ravi_id \gset
select tests.tx_world(:'asha_id') as wa \gset
select tests.tx_world(:'ravi_id') as wr \gset
select gen_random_uuid() as asha_item \gset
select gen_random_uuid() as ravi_item \gset

select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.lchange('plan_item', :'asha_item', 'create',
         tests.plan_fields('Rent', (:'wa'::jsonb ->> 'shop')::uuid, (:'wa'::jsonb ->> 'bank')::uuid)));
select tests.authenticate_as(:'ravi_id');
select tests.apply1(tests.lchange('plan_item', :'ravi_item', 'create',
         tests.plan_fields('Rent', (:'wr'::jsonb ->> 'shop')::uuid, (:'wr'::jsonb ->> 'bank')::uuid)));
select tests.apply1(tests.lchange('plan_occurrence', app._plan_occurrence_id(:'ravi_item', tests.month(0)::date), 'create',
         jsonb_build_object('itemId', :'ravi_item', 'month', tests.month(0), 'amountMinor', '2600000')));

-- ---------------------------------------------------------------- 1: A cannot read B
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from public.plan_items), 1, 'a user sees only their own plan items');
select is((select count(*)::int from public.plan_occurrences), 0, 'another user''s item months are invisible');
select ok(not (app.pull_changes(0)::text like '%' || :'ravi_item' || '%'), 'pull never contains another user''s plan');

-- ---------------------------------------------------------------- 2: owner-admin
select tests.authenticate_as(:'owner_id');
select is((select count(*)::int from public.plan_items) + (select count(*)::int from public.plan_occurrences), 0,
          'the owner-admin reads no plan');

-- ---------------------------------------------------------------- 3: no direct writes
select tests.authenticate_as(:'asha_id');
select throws_ok(format($$ update public.plan_items set name = 'x' where id = %L $$, :'asha_item'), '42501', null,
                 'direct update of plan items is refused');
select throws_ok(format($$ insert into public.plan_occurrences (id, user_id, item_id, month, server_seq)
                           values (gen_random_uuid(), %L, %L, current_date, 1) $$, :'asha_id', :'asha_item'), '42501', null,
                 'direct insert of item months is refused');

-- ---------------------------------------------------------------- 4: another user's ids
select is(tests.outcome(tests.lchange('plan_item', :'ravi_item', 'update', '{"name":"Mine"}')), 'NOT_FOUND',
          'editing another user''s item reports NOT_FOUND');
select is(tests.outcome(tests.lchange('plan_item', gen_random_uuid(), 'create',
            tests.plan_fields('X', (:'wr'::jsonb ->> 'shop')::uuid, (:'wa'::jsonb ->> 'bank')::uuid))), 'INVALID_PLAN_ITEM',
          'another user''s payee is refused');
select is(tests.outcome(tests.lchange('plan_item', gen_random_uuid(), 'create',
            tests.plan_fields('X', (:'wa'::jsonb ->> 'shop')::uuid, (:'wr'::jsonb ->> 'bank')::uuid))), 'INVALID_PLAN_ITEM',
          'another user''s pay-from account is refused');
select is(tests.outcome(tests.lchange('plan_item', gen_random_uuid(), 'create',
            tests.plan_fields('X', (:'wa'::jsonb ->> 'shop')::uuid, (:'wa'::jsonb ->> 'bank')::uuid, '100', null,
                              jsonb_build_object('categoryId', :'wr'::jsonb ->> 'groceries')))), 'INVALID_PLAN_ITEM',
          'another user''s category is refused');
select is(tests.outcome(tests.lchange('plan_item', gen_random_uuid(), 'create',
            tests.plan_fields('X', null, (:'wa'::jsonb ->> 'bank')::uuid, null, null,
                              jsonb_build_object('target', 'card', 'cardAccountId', :'wr'::jsonb ->> 'card', 'payeeId', null)))),
          'INVALID_PLAN_ITEM', 'another user''s credit card is refused');
select is(tests.outcome(tests.lchange('plan_occurrence', app._plan_occurrence_id(:'ravi_item', tests.month(0)::date), 'create',
            jsonb_build_object('itemId', :'ravi_item', 'month', tests.month(0), 'skipped', true))), 'INVALID_OCCURRENCE',
          'another user''s item month is refused');
select is(tests.outcome(tests.lchange('plan_occurrence', app._plan_occurrence_id(:'ravi_item', tests.month(1)::date), 'create',
            jsonb_build_object('itemId', :'ravi_item', 'month', tests.month(1), 'skipped', true))), 'INVALID_OCCURRENCE',
          'a month of another user''s item is refused');
select tests.as_superuser();
select is((select name from public.plan_items where id = :'ravi_item'), 'Rent', 'the other user''s item is unchanged');

-- ---------------------------------------------------------------- preferences (FR-023, R7-09)
select tests.authenticate_as(:'asha_id');
update public.user_preferences set plan_nudge = false, plan_checked_month = tests.month(1)::date where user_id = :'asha_id';
update public.user_preferences set plan_checked_month = tests.month(0)::date where user_id = :'asha_id';
select is((select plan_checked_month::text from public.user_preferences), tests.month(1),
          'the checked month never moves back for a client');
update public.user_preferences set plan_checked_month = null where user_id = :'asha_id';
select is((select plan_checked_month::text || ' ' || plan_nudge::text from public.user_preferences), tests.month(1) || ' false',
          'nor is it cleared by a client; the reminder setting is the user''s own');

-- ---------------------------------------------------------------- 6: history, disabled users
select is((select count(*)::int from public.audit_events where target_type in ('plan_item', 'plan_month')), 0,
          'clients cannot read plan history');
select tests.as_superuser();
update public.profiles set status = 'disabled' where user_id = :'asha_id';
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from public.plan_items), 0, 'a disabled user reads no plan');

select * from finish();
rollback;
