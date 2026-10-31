-- T006 Change history for categories, tags and payees (FR-028, research R3-14; SC-006).
begin;
select plan(14);

select tests.as_superuser();
select tests.create_user('lists.audit@example.com') as asha_id \gset
select gen_random_uuid() as food \gset
select gen_random_uuid() as groceries \gset
select gen_random_uuid() as other \gset
select gen_random_uuid() as tag \gset
select gen_random_uuid() as tag2 \gset
select gen_random_uuid() as shop \gset

select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.lchange('category', :'food', 'create', tests.category_fields('Food')));
select tests.apply1(tests.lchange('category', :'other', 'create', tests.category_fields('Other')));
select tests.apply1(tests.lchange('category', :'groceries', 'create', tests.category_fields('Groceries', 'expense', :'food')), 'android');
select tests.apply1(tests.lchange('category', :'groceries', 'update', jsonb_build_object('parentId', :'other')));
select tests.apply1(tests.lchange('category', :'groceries', 'update', '{"hidden":true}'));
select tests.apply1(tests.lchange('category', :'groceries', 'update', '{"hidden":false}'));
select tests.apply1(tests.lchange('category', :'groceries', 'update', '{"name":"Grocery","colour":"blue"}'));
select tests.apply1(tests.lchange('tag', :'tag', 'create', '{"name":"Goa trip"}'));
select tests.apply1(tests.lchange('tag', :'tag', 'update', '{"name":"Goa trip 2026"}'));
select tests.apply1(tests.lchange('tag', :'tag2', 'create', '{"name":"Holiday"}'));
select tests.apply1(tests.lchange('tag', :'tag2', 'merge', jsonb_build_object('targetId', :'tag')));
select tests.apply1(tests.lchange('payee', :'shop', 'create', tests.business_fields('Fresh Mart')));
select tests.apply1(tests.lchange('payee', :'shop', 'update', '{"hidden":true}'));
select tests.apply1(tests.lchange('payee', :'shop', 'update', '{"notes":"Weekly vegetables"}'));
select tests.apply1(tests.lchange('payee', gen_random_uuid(), 'create', tests.business_fields('fresh mart'),
                                  '{"onNameConflict":"suffix"}'));
select tests.apply1(tests.lchange('payee', :'shop', 'delete'));

select tests.as_superuser();
create temp table actions as
  select target_id, action::text as action, device_type, details from public.audit_events
   where target_type in ('category', 'tag', 'payee') and details ->> 'ownerId' = :'asha_id' order by occurred_at, id;

select is((select array_agg(action order by details ->> 'hlc') from actions where target_id = :'groceries'),
          array['category_created', 'category_moved', 'category_hidden', 'category_unhidden', 'category_edited'],
          'category actions: created, moved, hidden, unhidden, edited');
select is((select device_type::text from actions where target_id = :'groceries' and action = 'category_created'), 'android',
          'device type is recorded');
select is((select details -> 'changes' -> 'parent_id' ->> 'after' from actions where action = 'category_moved'), :'other',
          'a move records the new parent');
select is((select details -> 'changes' -> 'name' from actions where target_id = :'groceries' and action = 'category_edited'),
          '{"before":"Groceries","after":"Grocery"}'::jsonb, 'an edit records before and after');
select ok((select not (details -> 'changes' ? 'server_seq') and not (details -> 'changes' ? 'field_versions')
             from actions where target_id = :'groceries' and action = 'category_edited'),
          'bookkeeping columns are not recorded as changes');
select is((select array_agg(action order by details ->> 'hlc') from actions where target_id = :'tag'),
          array['tag_created', 'tag_renamed'], 'tag actions: created, renamed');
select is((select action from actions where target_id = :'tag2' and action like 'tag_m%'), 'tag_merged',
          'a merged source is recorded as merged');
select is((select details -> 'changes' -> 'merged_into' ->> 'after' from actions where action = 'tag_merged'), :'tag',
          'the merge records its target');
select is((select array_agg(action order by details ->> 'hlc') from actions where target_id = :'shop'),
          array['payee_created', 'payee_hidden', 'payee_edited', 'payee_deleted'],
          'payee actions: created, hidden, edited, deleted');
select is((select count(*)::int from actions where action = 'payee_sync_renamed'), 1, 'a suffixed create is recorded as sync-renamed');
select ok((select bool_and(details ->> 'ownerId' = :'asha_id') from actions), 'every row records the owner');
select ok((select bool_and(details ? 'changeId' and details ? 'hlc') from actions), 'every row records the change id and HLC');
select is((select count(*)::int from actions), 16, 'one history row per changed row');

-- A change that loses to a newer edit writes no history.
select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.change('category', :'food', 'update', '{"name":"Old name"}', tests.hlc(1000000000000)));
select tests.as_superuser();
select is((select count(*)::int from public.audit_events where target_id = :'food'), 1, 'a losing edit writes no history');

select * from finish();
rollback;
