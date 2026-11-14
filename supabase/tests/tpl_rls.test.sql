-- R8 T008 Template access rules: own data only (constitution I).
begin;
select plan(10);

select tests.as_superuser();
update public.profiles set role = 'member' where role = 'owner';
select tests.create_user('tpl.owner@example.com', 'owner') as owner_id \gset
select tests.create_user('tpl.asha@example.com') as asha_id \gset
select tests.create_user('tpl.ravi@example.com') as ravi_id \gset
select tests.tx_world(:'asha_id') as wa \gset
select tests.tx_world(:'ravi_id') as wr \gset
select gen_random_uuid() as asha_t, gen_random_uuid() as ravi_t, gen_random_uuid() as ravi_plan \gset

select tests.authenticate_as(:'ravi_id');
select tests.apply1(tests.lchange('template', :'ravi_t', 'create', tests.tpl_fields('Milk', 'expense', (:'wr'::jsonb ->> 'cash')::uuid)));
select tests.apply1(tests.lchange('plan_item', :'ravi_plan', 'create', tests.plan_fields('Rent', (:'wr'::jsonb ->> 'shop')::uuid, (:'wr'::jsonb ->> 'bank')::uuid)));
select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.lchange('template', :'asha_t', 'create', tests.tpl_fields('Milk', 'expense', (:'wa'::jsonb ->> 'cash')::uuid)));

select is((select count(*)::int from public.transaction_templates), 1, 'a user sees only their own templates');
select ok(not (app.pull_changes(0)::text like '%' || :'ravi_t' || '%'), 'pull never contains another user''s templates');
select throws_ok(format($$ update public.transaction_templates set name = 'x' where id = %L $$, :'asha_t'), '42501', null,
                 'direct update of templates is refused');
select is(tests.outcome(tests.lchange('template', :'ravi_t', 'update', '{"name":"Mine"}')), 'NOT_FOUND',
          'editing another user''s template reports NOT_FOUND');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('X', 'expense', (:'wr'::jsonb ->> 'cash')::uuid))),
          'INVALID_TEMPLATE', 'another user''s account is refused');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('X', 'expense', (:'wa'::jsonb ->> 'cash')::uuid, '100',
            jsonb_build_object('payeeId', :'wr'::jsonb ->> 'shop')))), 'INVALID_TEMPLATE', 'another user''s payee is refused');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('X', 'expense', (:'wa'::jsonb ->> 'cash')::uuid, '100',
            jsonb_build_object('tagIds', jsonb_build_array(:'wr'::jsonb ->> 'tag'))))), 'INVALID_TEMPLATE', 'another user''s tag is refused');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('X', 'expense', (:'wa'::jsonb ->> 'bank')::uuid, '100',
            jsonb_build_object('payeeId', :'wa'::jsonb ->> 'shop', 'planItemId', :'ravi_plan')))), 'INVALID_TEMPLATE',
          'another user''s planned payment is refused');

select tests.authenticate_as(:'owner_id');
select is((select count(*)::int from public.transaction_templates), 0, 'the owner-admin reads no templates');
select tests.as_superuser();
update public.profiles set status = 'disabled' where user_id = :'asha_id';
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from public.transaction_templates), 0, 'a disabled user reads no templates');

select * from finish();
rollback;
