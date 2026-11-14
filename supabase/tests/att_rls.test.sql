-- R9 T009 Attachment files and records: own data only (constitution I; FR-003, SC-002).
begin;
select plan(14);

select tests.as_superuser();
update public.profiles set role = 'member' where role = 'owner';
select tests.create_user('att.owner@example.com', 'owner') as owner_id \gset
select tests.create_user('att.asha@example.com') as asha_id \gset
select tests.create_user('att.ravi@example.com') as ravi_id \gset
select tests.tx_world(:'asha_id') as wa \gset
select tests.tx_world(:'ravi_id') as wr \gset
select gen_random_uuid() as asha_tx, gen_random_uuid() as ravi_tx, gen_random_uuid() as asha_a, gen_random_uuid() as ravi_a,
       gen_random_uuid() as new_a \gset

select tests.authenticate_as(:'ravi_id');
select tests.apply1(tests.lchange('transaction', :'ravi_tx', 'create', tests.tx_fields('expense', (:'wr'::jsonb ->> 'bank')::uuid, '5000')));
select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.lchange('transaction', :'asha_tx', 'create', tests.tx_fields('expense', (:'wa'::jsonb ->> 'bank')::uuid, '5000')));
select tests.as_superuser();
select tests.att_object(:'ravi_id', :'ravi_a');
select tests.att_object(:'asha_id', :'asha_a');
select tests.authenticate_as(:'ravi_id');
select tests.apply1(tests.lchange('attachment', :'ravi_a', 'create', tests.att_fields(:'ravi_tx')));

-- ---------------------------------------------------------------- files (storage.objects)
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from storage.objects where bucket_id = 'attachments'), 1, 'a user sees only their own files');
select lives_ok(format($$ insert into storage.objects (bucket_id, name, owner, metadata)
                          values ('attachments', %L, %L, '{"size": 10, "mimetype": "image/jpeg"}') $$,
                       :'asha_id' || '/' || :'new_a', :'asha_id'),
                'a user can add a file to their own folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, owner, metadata)
                           values ('attachments', %L, %L, '{"size": 10, "mimetype": "image/jpeg"}') $$,
                        :'ravi_id' || '/' || gen_random_uuid(), :'asha_id'),
                 '42501', null, 'nobody can add a file to another user''s folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, owner, metadata)
                           values ('attachments', %L, %L, '{"size": 10, "mimetype": "image/jpeg"}') $$,
                        :'asha_id' || '/deeper/' || gen_random_uuid(), :'asha_id'),
                 '42501', null, 'files sit directly in the folder, named by the attachment');
with u as (update storage.objects set metadata = '{"size": 1}' where bucket_id = 'attachments' returning 1)
select is((select count(*)::int from u), 0, 'nobody can replace a file');
select set_config('storage.allow_delete_query', 'true', true);
with d as (delete from storage.objects where name = :'ravi_id' || '/' || :'ravi_a' returning 1)
select is((select count(*)::int from d), 0, 'nobody can remove another user''s file');
with d as (delete from storage.objects where name = :'asha_id' || '/' || :'new_a' returning 1)
select is((select count(*)::int from d), 1, 'a user can remove their own file');
select set_config('storage.allow_delete_query', 'false', true);

-- ---------------------------------------------------------------- records
select is((select count(*)::int from public.attachments), 0, 'a user sees only their own attachment records');
select ok(not (app.pull_changes(0)::text like '%' || :'ravi_a' || '%'), 'pull never contains another user''s attachments');
select throws_ok(format($$ insert into public.attachments (id, user_id, transaction_id, name, content_type, size_bytes, server_seq)
                           values (gen_random_uuid(), %L, %L, 'x', 'image/jpeg', 1, 0) $$, :'asha_id', :'asha_tx'),
                 '42501', null, 'direct writes to attachment records are refused');
select is(tests.outcome(tests.lchange('attachment', :'ravi_a', 'update', '{"name":"Mine"}')), 'NOT_FOUND',
          'renaming another user''s attachment reports NOT_FOUND');
select is(tests.outcome(tests.lchange('attachment', :'asha_a', 'create', tests.att_fields(:'ravi_tx'))), 'INVALID_ATTACHMENT',
          'attaching to another user''s transaction is refused');

select tests.authenticate_as(:'owner_id');
select is((select count(*)::int from storage.objects where bucket_id = 'attachments')
          + (select count(*)::int from public.attachments), 0, 'the owner-admin reads no files and no records');
select tests.as_superuser();
update public.profiles set status = 'disabled' where user_id = :'asha_id';
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from storage.objects where bucket_id = 'attachments'), 0, 'a disabled user reads no files');

select * from finish();
rollback;
