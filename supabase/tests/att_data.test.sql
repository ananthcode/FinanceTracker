-- R9 T012 Pull, reset, demo-load emptiness, erasure and search with attachments and warranties.
begin;
select plan(8);

select tests.as_superuser();
select tests.create_user('att.data@example.com') as uid \gset
select tests.tx_world(:'uid') as w \gset
select (:'w'::jsonb ->> 'bank') as bank \gset
select gen_random_uuid() as tx, gen_random_uuid() as plain, gen_random_uuid() as a1 \gset
select tests.authenticate_as(:'uid');
select tests.apply1(tests.lchange('transaction', :'tx', 'create', tests.tx_fields('expense', :'bank'::uuid, '4500000',
         '{"warrantyUntil":"2028-10-05","warrantyNote":"Fridge"}')));
select tests.apply1(tests.lchange('transaction', :'plain', 'create', tests.tx_fields('expense', :'bank'::uuid, '100')));
select tests.as_superuser();
select tests.att_object(:'uid', :'a1');
select tests.authenticate_as(:'uid');
select tests.apply1(tests.lchange('attachment', :'a1', 'create', tests.att_fields(:'tx')));

select is(jsonb_array_length(app.pull_changes(0) -> 'rows' -> 'attachment'), 1, 'pull returns attachment records');
select is((select r ->> 'warranty_until' from jsonb_array_elements(app.pull_changes(0) -> 'rows' -> 'transaction') r
            where r ->> 'id' = :'tx'), '2028-10-05', 'pull returns the warranty fields');
select is((app.search_transactions('{"warranty": true}') ->> 'count')::int, 1, 'the search filters what is under warranty');
select is((select r ->> 'attachment_count' from jsonb_array_elements(app.search_transactions('{}') -> 'rows') r
            where r ->> 'id' = :'tx'), '1', 'search rows carry their attachment count');

select tests.as_superuser();
select throws_ok(format($$ select app._load_demo(%L, '[{"x":1}]'::jsonb, 'web') $$, :'uid'), 'P0001', 'NOT_EMPTY',
                 'demo data loads only into empty data');
select app.scrub_user_from_audit(:'uid', 'att.data@example.com');
select is((select count(*)::int from public.audit_events where target_type = 'attachment' and details ->> 'ownerId' = :'uid'), 0,
          'erasure deletes the attachment history');
select is(app._reset_user_data(:'uid', 'web') ->> 'attachments', '1', 'reset deletes the attachment records');
select is((select count(*)::int from public.attachments where user_id = :'uid'), 0, 'none remain');

select * from finish();
rollback;
