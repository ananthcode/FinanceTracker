-- R8 T010 Merges, relocate and tag delete reach templates; pull, reset, demo load and erasure (R8-07).
begin;
select plan(11);

select tests.as_superuser();
select tests.create_user('tpl.data@example.com') as uid \gset
select tests.create_user('tpl.gone@example.com') as gone \gset
select tests.tx_world(:'uid') as w \gset
select tests.tx_world(:'gone') as wg \gset
select (:'w'::jsonb ->> 'bank') as bank, (:'w'::jsonb ->> 'shop') as shop, (:'w'::jsonb ->> 'groceries') as groceries,
       (:'w'::jsonb ->> 'eating') as eating, (:'w'::jsonb ->> 'tag') as tag \gset
select gen_random_uuid() as t1, gen_random_uuid() as mart2, gen_random_uuid() as tag2, gen_random_uuid() as gt \gset

select tests.authenticate_as(:'uid');
select tests.apply1(tests.lchange('payee', :'mart2', 'create', tests.business_fields('Mart Two')));
select tests.apply1(tests.lchange('tag', :'tag2', 'create', '{"name":"Weekly"}'));
select tests.apply1(tests.lchange('template', :'t1', 'create', tests.tpl_fields('Groceries', 'expense', :'bank'::uuid, '6000',
         jsonb_build_object('payeeId', :'mart2', 'categoryId', :'groceries', 'tagIds', jsonb_build_array(:'tag', :'tag2')))));

-- ---------------------------------------------------------------- merges reach templates (FR-015)
select tests.apply1(tests.lchange('payee', :'mart2', 'merge', jsonb_build_object('targetId', :'shop')));
select is((select payee_id::text from public.transaction_templates where id = :'t1'), :'shop', 'a payee merge moves the template''s payee');
select ok((select field_versions ? 'payeeId' from public.transaction_templates where id = :'t1'), 'with its field version bumped');
select tests.apply1(tests.lchange('category', :'groceries', 'relocate', jsonb_build_object('targetId', :'eating')));
select is((select category_id::text from public.transaction_templates where id = :'t1'), :'eating', 'a category relocate moves it');
select tests.apply1(tests.lchange('tag', :'tag2', 'delete'));
select is((select tag_ids from public.transaction_templates where id = :'t1'), array[:'tag'::uuid], 'a deleted tag leaves the template');

-- ---------------------------------------------------------------- pull, demo load, reset
select is(jsonb_array_length(app.pull_changes(0) -> 'rows' -> 'template'), 1, 'pull returns templates');
select tests.as_superuser();
select throws_ok(format($$ select app._load_demo(%L, '[{"x":1}]'::jsonb, 'web') $$, :'uid'), 'P0001', 'NOT_EMPTY',
                 'the demo household loads only into empty data (a template counts)');
select tests.authenticate_as(:'uid');
select is((app.reset_my_data('web') -> 'removed' ->> 'templates')::int, 1, 'reset removes templates');
select is((select count(*)::int from public.transaction_templates), 0, 'none are left');
select tests.as_superuser();
select is((select count(*)::int from public.audit_events where target_type = 'template' and details ->> 'ownerId' = :'uid'), 0,
          'reset deletes their history');

-- ---------------------------------------------------------------- erasure
select tests.authenticate_as(:'gone');
select tests.apply1(tests.lchange('template', :'gt', 'create', tests.tpl_fields('Milk', 'expense', (:'wg'::jsonb ->> 'cash')::uuid)));
select tests.as_superuser();
select app.scrub_user_from_audit(:'gone', 'tpl.gone@example.com');
delete from auth.users where id = :'gone';
select is((select count(*)::int from public.transaction_templates where user_id = :'gone'), 0, 'erasure leaves no template');
select is((select count(*)::int from public.audit_events where target_type = 'template' and details ->> 'ownerId' = :'gone'), 0,
          'nor any template history');

select * from finish();
rollback;
