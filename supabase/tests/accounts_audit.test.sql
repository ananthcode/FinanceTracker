-- T011 Account change history (FR-027, R2-08; SC-005): one audit row per changed row with
-- action, target, device type, owner and before/after values of the changed fields.
begin;
select plan(19);

select tests.as_superuser();
select tests.create_user('audit.asha@example.com') as asha_id \gset
select gen_random_uuid() as acc \gset
select gen_random_uuid() as grp \gset
select gen_random_uuid() as create_change \gset

-- The latest history row (read as superuser only).
create temporary view last_event as
  select e.* from public.audit_events e order by e.id desc limit 1;

select tests.authenticate_as(:'asha_id');

select tests.apply1(tests.change('account', :'acc', 'create', tests.account_fields('Everyday Savings', 'bank', '5234050'),
                                 null, null, :'create_change'), 'android');
select tests.as_superuser();
select is((select action::text from last_event), 'account_created', 'create: account_created');
select is((select target_type || '/' || target_id::text from last_event), 'account/' || :'acc', 'create: target is the account');
select is((select device_type from last_event), 'android', 'create: device type recorded');
select is((select actor_id from last_event), :'asha_id'::uuid, 'create: actor recorded');
select is((select details ->> 'ownerId' from last_event), :'asha_id', 'create: owner recorded for erasure');
select is((select details ->> 'changeId' from last_event), :'create_change', 'create: change id recorded');
select is((select details -> 'changes' -> 'name' ->> 'after' from last_event), 'Everyday Savings', 'create: values recorded');
select ok((select not (details -> 'changes' ?| array['server_seq', 'field_versions', 'updated_at']) from last_event),
          'create: bookkeeping columns are not recorded');

select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.change('account', :'acc', 'update', '{"name":"Main Savings"}'));
select tests.as_superuser();
select is((select action::text || ':' || (details -> 'changes' -> 'name' ->> 'before') || '>' || (details -> 'changes' -> 'name' ->> 'after')
             from last_event), 'account_edited:Everyday Savings>Main Savings', 'edit: before and after recorded');
select is((select device_type from last_event), 'web', 'edit: web device type recorded');

select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.change('account', :'acc', 'update', '{"sortKey":"a5"}'));
select tests.as_superuser();
select is((select action::text from last_event), 'account_reordered', 'reorder: account_reordered');

-- A losing (older) edit writes no history.
select count(*) as before_count from public.audit_events \gset
select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.change('account', :'acc', 'update', '{"name":"Stale"}', tests.hlc(1000000000000)));
select tests.as_superuser();
select is((select count(*) from public.audit_events), :'before_count'::bigint, 'merge: a losing edit writes no history');

select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.change('account', :'acc', 'update', '{"openingBalanceMinor":"0"}'));
select tests.apply1(tests.change('account', :'acc', 'archive'));
select tests.as_superuser();
select is((select action::text from last_event), 'account_archived', 'archive: account_archived');
select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.change('account', :'acc', 'restore'));
select tests.as_superuser();
select is((select action::text from last_event), 'account_restored', 'restore: account_restored');

select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.change('account', gen_random_uuid(), 'create', tests.account_fields('Main Savings'), null,
                                 '{"onNameConflict":"suffix"}'), 'android');
select tests.as_superuser();
select is((select action::text from last_event), 'account_sync_renamed', 'sync rename: account_sync_renamed');

-- Groups.
select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.change('account_group', :'grp', 'create', '{"name":"Family","sortKey":"a0"}'));
select tests.apply1(tests.change('account_group', :'grp', 'update', '{"name":"Held for family"}'));
select tests.as_superuser();
select is((select action::text || '/' || target_type from last_event), 'account_group_renamed/account_group', 'group: renamed');
select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.change('account', :'acc', 'update', jsonb_build_object('groupId', :'grp')));
select tests.apply1(tests.change('account_group', :'grp', 'delete'));
select tests.as_superuser();
select is((select count(*)::int from public.audit_events
            where action = 'account_group_deleted' and target_id = :'grp'), 1, 'group: account_group_deleted');
select is((select (details -> 'changes' -> 'group_id' ->> 'after') is null from public.audit_events
            where action = 'account_edited' and target_id = :'acc' order by id desc limit 1),
          true, 'group delete: the account move to Ungrouped is recorded');

select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.change('account', :'acc', 'delete'));
select tests.as_superuser();
select is((select action::text from last_event), 'account_deleted', 'delete: account_deleted');

select * from finish();
rollback;
