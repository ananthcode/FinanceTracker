-- T005 Category, tag and payee access rules — R3 contracts/database.md rules 1–3, 6–8 (SC-005).
begin;
select plan(21);

select tests.as_superuser();
update public.profiles set role = 'member' where role = 'owner';
select tests.create_user('lists.owner@example.com', 'owner') as owner_id \gset
select tests.create_user('lists.asha@example.com') as asha_id \gset
select tests.create_user('lists.ravi@example.com') as ravi_id \gset
select gen_random_uuid() as asha_cat \gset
select gen_random_uuid() as asha_tag \gset
select gen_random_uuid() as asha_payee \gset
select gen_random_uuid() as ravi_cat \gset
select gen_random_uuid() as ravi_tag \gset
select gen_random_uuid() as ravi_payee \gset

select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.lchange('category', :'asha_cat', 'create', tests.category_fields('Asha groceries')));
select tests.apply1(tests.lchange('tag', :'asha_tag', 'create', '{"name":"Asha tag"}'));
select tests.apply1(tests.lchange('payee', :'asha_payee', 'create', tests.person_fields('Asha friend', '150000')));
select tests.authenticate_as(:'ravi_id');
select tests.apply1(tests.lchange('category', :'ravi_cat', 'create', tests.category_fields('Ravi groceries')));
select tests.apply1(tests.lchange('tag', :'ravi_tag', 'create', '{"name":"Ravi tag"}'));
select tests.apply1(tests.lchange('payee', :'ravi_payee', 'create', tests.person_fields('Ravi friend', '-90000')));

-- ---------------------------------------------------------------- Rule 1: A cannot read B
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from public.categories), 1, 'rule 1: a user sees only their own categories');
select is((select count(*)::int from public.tags), 1, 'rule 1: a user sees only their own tags');
select is((select count(*)::int from public.payees), 1, 'rule 1: a user sees only their own payees');
select is((select jsonb_array_length(app.pull_changes(0) -> 'rows' -> 'payee')), 1, 'rule 1: pull returns only own payees');
select ok(not (app.pull_changes(0)::text like '%' || :'ravi_payee' || '%')
          and not (app.pull_changes(0)::text like '%' || :'ravi_cat' || '%'),
          'rule 1: pull never contains another user''s ids');

-- ---------------------------------------------------------------- Rule 2: owner-admin sees nothing of others
select tests.authenticate_as(:'owner_id');
select is((select count(*)::int from public.categories) + (select count(*)::int from public.tags)
          + (select count(*)::int from public.payees), 0, 'rule 2: the owner-admin reads no other user''s lists');

-- ---------------------------------------------------------------- Rule 3: no direct writes
select tests.authenticate_as(:'asha_id');
select throws_ok(format($$ insert into public.categories (id, user_id, name, kind, colour, icon, server_seq)
                   values (gen_random_uuid(), %L, 'Direct', 'expense', 'blue', 'bank', 1) $$, :'asha_id'),
                 '42501', null, 'rule 3: direct insert into categories is refused');
select throws_ok(format($$ update public.payees set opening_balance_minor = 1 where id = %L $$, :'asha_payee'),
                 '42501', null, 'rule 3: direct update of payees is refused');
select throws_ok(format($$ delete from public.tags where id = %L $$, :'asha_tag'),
                 '42501', null, 'rule 3: direct delete from tags is refused');

-- ---------------------------------------------------------------- Rule 4: apply_changes is scoped to the caller
select is(tests.outcome(tests.lchange('payee', :'ravi_payee', 'update', '{"name":"Hacked"}')), 'NOT_FOUND',
          'rule 4: updating another user''s payee reports NOT_FOUND');
select is(tests.outcome(tests.lchange('category', gen_random_uuid(), 'create',
            tests.category_fields('Under Ravi', 'expense', :'ravi_cat'))), 'INVALID_MOVE',
          'rule 4: a category cannot be put under another user''s category');
select is(tests.outcome(tests.lchange('payee', gen_random_uuid(), 'create',
            tests.business_fields('Shop', jsonb_build_object('defaultCategoryId', :'ravi_cat')))), 'VALIDATION_FAILED',
          'rule 4: a payee cannot default to another user''s category');
select is(tests.outcome(tests.lchange('tag', :'asha_tag', 'merge', jsonb_build_object('targetId', :'ravi_tag'))), 'NOT_FOUND',
          'rule 4: a tag cannot be merged into another user''s tag');
select is(tests.outcome(tests.lchange('payee', :'asha_payee', 'merge', jsonb_build_object('targetId', :'ravi_payee'))),
          'NOT_FOUND', 'rule 4: a payee cannot be merged into another user''s payee');
select tests.as_superuser();
select is((select opening_balance_minor from public.payees where id = :'ravi_payee'), -90000::bigint,
          'rule 4: the other user''s payee is unchanged');
select is((select state::text from public.tags where id = :'ravi_tag'), 'active', 'rule 4: the other user''s tag is unchanged');

-- ---------------------------------------------------------------- Rule 7: history is not client-readable
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from public.audit_events where target_type in ('category', 'tag', 'payee')), 0,
          'rule 7: clients cannot read category, tag or payee history');

-- ---------------------------------------------------------------- Rule 6: a disabled user gets nothing
select tests.as_superuser();
update public.profiles set status = 'disabled' where user_id = :'asha_id';
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from public.payees), 0, 'rule 6: a disabled user reads no payees');
select throws_ok($$ select app.start_categories('suggested', '[]'::jsonb) $$, 'P0001', 'USER_INACTIVE',
                 'rule 6: a disabled user cannot start categories');

-- ---------------------------------------------------------------- Rule 8: erasure removes everything of the user
select tests.as_superuser();
select ok((select count(*) from public.audit_events where target_type = 'payee' and details ->> 'ownerId' = :'ravi_id') > 0,
          'rule 8: history existed before erasure');
select app.scrub_user_from_audit(:'ravi_id', 'lists.ravi@example.com');
delete from auth.users where id = :'ravi_id';
select is((select count(*)::int from public.categories where user_id = :'ravi_id')
        + (select count(*)::int from public.tags where user_id = :'ravi_id')
        + (select count(*)::int from public.payees where user_id = :'ravi_id')
        + (select count(*)::int from public.audit_events
            where target_type in ('category', 'tag', 'payee') and details ->> 'ownerId' = :'ravi_id'),
          0, 'rule 8: no category, tag, payee or their history of the erased user remains');

select * from finish();
rollback;
