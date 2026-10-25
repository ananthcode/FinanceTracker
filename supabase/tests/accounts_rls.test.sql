-- T009 Accounts access rules — contracts/database.md rules 1–6 and 8 (constitution I; SC-004).
begin;
select plan(25);

select tests.as_superuser();
update public.profiles set role = 'member' where role = 'owner';
select tests.create_user('acc.owner@example.com', 'owner') as owner_id \gset
select tests.create_user('acc.asha@example.com') as asha_id \gset
select tests.create_user('acc.ravi@example.com') as ravi_id \gset
select gen_random_uuid() as asha_acc \gset
select gen_random_uuid() as asha_grp \gset
select gen_random_uuid() as ravi_acc \gset
select gen_random_uuid() as ravi_grp \gset

-- Each user creates an account and a group through the only write path.
select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.change('account_group', :'asha_grp', 'create', '{"name":"Asha group","sortKey":"a0"}'));
select tests.apply1(tests.change('account', :'asha_acc', 'create', tests.account_fields('Asha Savings', 'bank', '100000')));
select tests.authenticate_as(:'ravi_id');
select tests.apply1(tests.change('account_group', :'ravi_grp', 'create', '{"name":"Ravi group","sortKey":"a0"}'));
select tests.apply1(tests.change('account', :'ravi_acc', 'create', tests.account_fields('Ravi Savings', 'bank', '200000')));

-- ---------------------------------------------------------------- Rule 1: A cannot read B
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from public.accounts), 1, 'rule 1: a user sees only their own accounts');
select is((select count(*)::int from public.accounts where id = :'ravi_acc'), 0, 'rule 1: another user''s account is invisible');
select is((select count(*)::int from public.account_groups where id = :'ravi_grp'), 0, 'rule 1: another user''s group is invisible');
select is((select jsonb_array_length(app.pull_changes(0) -> 'rows' -> 'account')), 1, 'rule 1: pull returns only own accounts');
select ok(not (app.pull_changes(0)::text like '%' || :'ravi_acc' || '%'), 'rule 1: pull never contains another user''s ids');
select throws_ok($$ select count(*) from private.applied_changes $$, '42501', null,
                 'rule 1: applied changes are not readable by clients');

-- ---------------------------------------------------------------- Rule 2: owner-admin sees nothing of others
select tests.authenticate_as(:'owner_id');
select is((select count(*)::int from public.accounts), 0, 'rule 2: the owner-admin reads no other user''s accounts');
select is((select count(*)::int from public.account_groups), 0, 'rule 2: the owner-admin reads no other user''s groups');

-- ---------------------------------------------------------------- Rule 3: no direct writes
select tests.authenticate_as(:'asha_id');
select throws_ok(format($$ insert into public.accounts (id, user_id, name, type, opening_balance_minor, opening_balance_date,
                   currency, colour, icon, sort_key, server_seq) values (gen_random_uuid(), %L, 'Direct', 'bank', 0,
                   '2026-04-01', 'INR', 'blue', 'bank', 'a0', 1) $$, :'asha_id'),
                 '42501', null, 'rule 3: direct insert into accounts is refused');
select throws_ok(format($$ update public.accounts set opening_balance_minor = 1 where id = %L $$, :'asha_acc'),
                 '42501', null, 'rule 3: direct update of accounts is refused');
select throws_ok(format($$ delete from public.accounts where id = %L $$, :'asha_acc'),
                 '42501', null, 'rule 3: direct delete from accounts is refused');
select throws_ok($$ insert into public.account_groups (id, user_id, name, sort_key, server_seq)
                    values (gen_random_uuid(), auth.uid(), 'Direct', 'a0', 1) $$,
                 '42501', null, 'rule 3: direct insert into account_groups is refused');

-- ---------------------------------------------------------------- Rule 4: apply_changes is scoped to the caller
select is(tests.apply1(tests.change('account', :'ravi_acc', 'update', '{"name":"Hacked"}')) ->> 'code', 'NOT_FOUND',
          'rule 4: updating another user''s account reports NOT_FOUND');
select is(tests.apply1(tests.change('account', :'ravi_acc', 'archive')) ->> 'code', 'NOT_FOUND',
          'rule 4: archiving another user''s account reports NOT_FOUND');
select is(tests.apply1(tests.change('account', :'ravi_acc', 'create', tests.account_fields('Steal'))) ->> 'status', 'rejected',
          'rule 4: creating with another user''s account id is rejected');
select is(tests.apply1(tests.change('account', gen_random_uuid(), 'create',
            tests.account_fields('With owner', 'bank', '0', jsonb_build_object('userId', :'ravi_id')))) ->> 'code',
          'VALIDATION_FAILED', 'rule 4: a crafted userId field is rejected');
select is(tests.apply1(tests.change('account', gen_random_uuid(), 'create',
            tests.account_fields('Into Ravi group', 'bank', '0', jsonb_build_object('groupId', :'ravi_grp')))) ->> 'code',
          'VALIDATION_FAILED', 'rule 4: an account cannot be put in another user''s group');
select tests.as_superuser();
select is((select name from public.accounts where id = :'ravi_acc'), 'Ravi Savings', 'rule 4: the other user''s row is unchanged');
select is((select state::text from public.accounts where id = :'ravi_acc'), 'active', 'rule 4: the other user''s state is unchanged');

-- ---------------------------------------------------------------- Rule 6: account history is not client-readable
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from public.audit_events where target_type in ('account', 'account_group')), 0,
          'rule 6: clients cannot read account history');

-- ---------------------------------------------------------------- Rule 5: a disabled user gets nothing
select tests.as_superuser();
update public.profiles set status = 'disabled' where user_id = :'asha_id';
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from public.accounts), 0, 'rule 5: a disabled user reads no accounts');
select throws_ok($$ select app.apply_changes('[]'::jsonb, 'web') $$, 'P0001', 'USER_INACTIVE',
                 'rule 5: a disabled user cannot apply changes');
select throws_ok($$ select app.pull_changes(0) $$, 'P0001', 'USER_INACTIVE', 'rule 5: a disabled user cannot pull');

-- ---------------------------------------------------------------- Rule 8: erasure removes everything of the user
select tests.as_superuser();
select ok((select count(*) from public.audit_events where target_type = 'account' and details ->> 'ownerId' = :'ravi_id') > 0,
          'rule 8: history existed before erasure');
select app.scrub_user_from_audit(:'ravi_id', 'acc.ravi@example.com');
delete from auth.users where id = :'ravi_id';
select is((select count(*)::int from public.accounts where user_id = :'ravi_id')
        + (select count(*)::int from public.account_groups where user_id = :'ravi_id')
        + (select count(*)::int from private.applied_changes where user_id = :'ravi_id')
        + (select count(*)::int from public.audit_events
            where target_type in ('account', 'account_group') and details ->> 'ownerId' = :'ravi_id'),
          0, 'rule 8: no account, group, applied change or account history of the erased user remains');

select * from finish();
rollback;
