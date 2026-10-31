-- T060 Merges of categories (recursive), payees and tags (FR-023, FR-024, FR-010, research R3-05; SC-003).
begin;
select plan(24);

select tests.as_superuser();
select tests.create_user('lists.merge@example.com') as asha_id \gset
-- Source tree:  Eating out › Weekend › Brunch ; Eating out › Office
-- Target tree:  Food delivery › Weekend › Dinner
select gen_random_uuid() as src \gset
select gen_random_uuid() as src_weekend \gset
select gen_random_uuid() as src_brunch \gset
select gen_random_uuid() as src_office \gset
select gen_random_uuid() as tgt \gset
select gen_random_uuid() as tgt_weekend \gset
select gen_random_uuid() as tgt_dinner \gset
select gen_random_uuid() as salary \gset
select gen_random_uuid() as cafe \gset
select gen_random_uuid() as ravi \gset
select gen_random_uuid() as ravi2 \gset
select gen_random_uuid() as shop \gset
select gen_random_uuid() as tag_a \gset
select gen_random_uuid() as tag_b \gset

select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.lchange('category', :'src', 'create', tests.category_fields('Eating out')));
select tests.apply1(tests.lchange('category', :'src_weekend', 'create', tests.category_fields('Weekend', 'expense', :'src')));
select tests.apply1(tests.lchange('category', :'src_brunch', 'create', tests.category_fields('Brunch', 'expense', :'src_weekend')));
select tests.apply1(tests.lchange('category', :'src_office', 'create', tests.category_fields('Office', 'expense', :'src')));
select tests.apply1(tests.lchange('category', :'tgt', 'create', tests.category_fields('Food delivery')));
select tests.apply1(tests.lchange('category', :'tgt_weekend', 'create', tests.category_fields('WEEKEND', 'expense', :'tgt')));
select tests.apply1(tests.lchange('category', :'tgt_dinner', 'create', tests.category_fields('Dinner', 'expense', :'tgt_weekend')));
select tests.apply1(tests.lchange('category', :'salary', 'create', tests.category_fields('Salary', 'income')));
select tests.apply1(tests.lchange('payee', :'cafe', 'create',
                                  tests.business_fields('Corner Cafe', jsonb_build_object('defaultCategoryId', :'src_weekend'))));

-- ---------------------------------------------------------------- invalid category merges
select is(tests.outcome(tests.lchange('category', :'src', 'merge', jsonb_build_object('targetId', :'src_brunch'))),
          'INVALID_MERGE', 'a category cannot merge into its own descendant');
select is(tests.outcome(tests.lchange('category', :'src', 'merge', jsonb_build_object('targetId', :'src'))),
          'INVALID_MERGE', 'a category cannot merge into itself');
select is(tests.outcome(tests.lchange('category', :'src', 'merge', jsonb_build_object('targetId', :'salary'))),
          'INVALID_MERGE', 'a category cannot merge into the other kind');
select is(tests.outcome(tests.lchange('category', :'src', 'merge', jsonb_build_object('targetId', gen_random_uuid()))),
          'NOT_FOUND', 'a missing target reports NOT_FOUND');

-- ---------------------------------------------------------------- the merge
select tests.as_superuser();
select max(server_seq) as seq_before from public.categories where user_id = :'asha_id' \gset
select tests.authenticate_as(:'asha_id');
select tests.lchange('category', :'src', 'merge', jsonb_build_object('targetId', :'tgt')) as merge_change \gset
select is(tests.outcome(:'merge_change'::jsonb), 'applied', 'Eating out merges into Food delivery');

select tests.as_superuser();
select is((select state::text || '/' || merged_into from public.categories where id = :'src'), 'deleted/' || :'tgt',
          'the source is deleted and points at its target');
select is((select state::text || '/' || merged_into from public.categories where id = :'src_weekend'), 'deleted/' || :'tgt_weekend',
          'a same-named sub-category (any case) merges into the target''s');
select is((select parent_id from public.categories where id = :'src_brunch'), :'tgt_weekend'::uuid,
          'its children move under the target''s sub-category (three levels)');
select is((select parent_id from public.categories where id = :'tgt_dinner'), :'tgt_weekend'::uuid,
          'the target''s own children stay');
select is((select parent_id from public.categories where id = :'src_office'), :'tgt'::uuid,
          'a sub-category with a new name moves under the target');
select is((select default_category_id from public.payees where id = :'cafe'), :'tgt_weekend'::uuid,
          'payee defaults are repointed to the merged category');
select ok((select bool_and(server_seq > :seq_before) from public.categories
            where id in (:'src', :'src_weekend', :'src_brunch', :'src_office')),
          'every touched category gets a new server_seq');
select is((select count(*)::int from public.audit_events
            where details ->> 'changeId' = (:'merge_change'::jsonb ->> 'changeId')),
          5, 'one history row per touched row, all carrying the merge''s change id');
select is((select count(*)::int from public.categories where user_id = :'asha_id' and state = 'active'), 6,
          'no category is lost or duplicated');

select tests.authenticate_as(:'asha_id');
select is(tests.apply1(:'merge_change'::jsonb) ->> 'status', 'duplicate', 'a replayed merge is applied once');
select is(tests.outcome(tests.lchange('category', :'src', 'update', '{"name":"Late edit"}')), 'NOT_FOUND',
          'an edit to a merged source reports NOT_FOUND');

-- ---------------------------------------------------------------- payees
select tests.apply1(tests.lchange('payee', :'ravi', 'create',
                                  tests.person_fields('Ravi Kumar', '1500000', '{"notes":"Old notes","includeInNetWorth":true}')));
select tests.apply1(tests.lchange('payee', :'ravi2', 'create',
                                  tests.person_fields('Ravi K', '-450000', '{"openingBalanceDate":"2026-01-15","notes":"New notes"}')));
select tests.apply1(tests.lchange('payee', :'shop', 'create', tests.business_fields('Fresh Mart')));
select is(tests.outcome(tests.lchange('payee', :'ravi2', 'merge', jsonb_build_object('targetId', :'shop'))), 'INVALID_MERGE',
          'a person cannot merge into a business');
select is(tests.outcome(tests.lchange('payee', :'ravi2', 'merge', jsonb_build_object('targetId', :'ravi'))), 'applied',
          'two people merge');
select tests.as_superuser();
select is((select opening_balance_minor from public.payees where id = :'ravi'), 1050000::bigint,
          'opening balances are added exactly');
select is((select opening_balance_date from public.payees where id = :'ravi'), '2026-01-15'::date, 'the earlier date is kept');
select is((select notes from public.payees where id = :'ravi'), E'Old notes\nNew notes', 'the source''s notes are appended');
select is((select name || '/' || include_in_net_worth from public.payees where id = :'ravi'), 'Ravi Kumar/true',
          'the target keeps its name and net-worth switch');

-- ---------------------------------------------------------------- tags
select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.lchange('tag', :'tag_a', 'create', '{"name":"Diwali"}'));
select tests.apply1(tests.lchange('tag', :'tag_b', 'create', '{"name":"Diwali 2026"}'));
select is(tests.outcome(tests.lchange('tag', :'tag_a', 'merge', jsonb_build_object('targetId', :'tag_b'))), 'applied',
          'a tag merges into another');
select is((select count(*)::int from public.tags where state = 'active'), 1, 'one tag remains');

select * from finish();
rollback;
