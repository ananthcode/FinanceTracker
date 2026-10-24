-- T087 Owner-admin functions (FR-013–FR-016a; database rules 8, 10, 12; SC-009).
begin;
select plan(22);
select tests.as_superuser();
-- Existing owners (e.g. from local E2E runs) are set aside inside this rolled-back transaction.
update public.profiles set role = 'member' where role = 'owner';

select tests.create_user('admin.owner@example.com', 'owner') as owner_id \gset
select tests.create_user('admin.asha@example.com') as asha_id \gset
select tests.create_user('admin.ravi@example.com') as ravi_id \gset

-- ------------------------------------------------ admin_list_users: FR-014 columns only
select is((select array_agg(k order by k)
             from jsonb_object_keys((select to_jsonb(u) from app.admin_list_users() u limit 1)) k),
          array['created_at', 'display_name', 'email', 'last_sign_in_at', 'role', 'status', 'user_id'],
          'admin_list_users returns only the FR-014 fields');
select ok((select count(*) from app.admin_list_users()) >= 3, 'admin_list_users lists every user');

-- ------------------------------------------------ set_user_status
select lives_ok(format($$ select app.set_user_status(%L, 'disabled', %L) $$, :'asha_id', :'owner_id'),
                'owner can disable a member');
select is((select status::text from public.profiles where user_id = :'asha_id'), 'disabled', 'member is disabled');
select is((select count(*)::int from public.audit_events where action = 'user_disabled' and target_id = :'asha_id'), 1,
          'disable is audited');
select throws_ok(format($$ select app.set_user_status(%L, 'disabled', %L) $$, :'owner_id', :'owner_id'),
                 'P0001', 'CANNOT_TARGET_OWNER', 'the owner cannot be disabled');
select throws_ok(format($$ select app.set_user_status(%L, 'active', %L) $$, :'ravi_id', :'owner_id'),
                 'P0001', 'NOT_DISABLED', 'enabling an active user is refused');

-- Disabled mid-setup: the user can no longer change anything (erase/disable precedence).
select tests.authenticate_as(:'asha_id');
update public.profiles set display_name = 'Too late' where user_id = :'asha_id';
update public.user_preferences set timezone = 'UTC' where user_id = :'asha_id';
select tests.as_superuser();
select is((select display_name from public.profiles where user_id = :'asha_id'), null,
          'a disabled user cannot update their profile');
select is((select timezone from public.user_preferences where user_id = :'asha_id'), 'Asia/Kolkata',
          'a disabled user cannot update their preferences');

select lives_ok(format($$ select app.set_user_status(%L, 'active', %L) $$, :'asha_id', :'owner_id'),
                'owner can re-enable a member');

-- ------------------------------------------------ Rule 10: single owner
select throws_ok(format($$ update public.profiles set role = 'owner' where user_id = %L $$, :'ravi_id'),
                 '23505', null, 'a second owner cannot exist');

-- ------------------------------------------------ Rule 8 / SC-009: erasure scrubs identifiers
insert into public.invitations (email, token_hash, status)
values ('admin.ravi@example.com', extensions.digest('old-token', 'sha256'), 'superseded');
select app.write_audit('password_reset_requested', null, null, 'session', null, null, null,
  jsonb_build_object('emailRef', encode(extensions.digest('admin.ravi@example.com', 'sha256'), 'hex')));

select app.scrub_user_from_audit(:'ravi_id', 'admin.ravi@example.com') as erased_ref \gset
select matches(:'erased_ref'::text, '^erased:[0-9a-f-]{36}$', 'scrub returns a non-identifying reference');
select is((select count(*)::int from public.audit_events
            where actor_id = :'ravi_id' or target_id = :'ravi_id'
               or actor_ref ilike 'admin.ravi@example.com' or target_ref ilike 'admin.ravi@example.com'), 0,
          'no audit row keeps the erased user''s id or email');
select is((select count(*)::int from public.audit_events
            where details ->> 'emailRef' = encode(extensions.digest('admin.ravi@example.com', 'sha256'), 'hex')), 0,
          'no audit row keeps a digest of the erased email');
select is((select count(*)::int from public.invitations where email = 'admin.ravi@example.com'), 0,
          'every invitation for the erased email is deleted');

-- ------------------------------------------------ Rule 12: no tokens in audit details
-- ("method": "password" names the sign-in method; it is not a secret.)
select is((select count(*)::int
             from public.audit_events e, jsonb_each_text(e.details) d
            where d.key ~* '(token|password|pin|secret|hash)' or d.value ~ '^[A-Za-z0-9_-]{43}$'), 0,
          'audit details never contain secret fields or token-shaped values');

-- ------------------------------------------------ FR-013a: owner recovery
select lives_ok(format($$ select app.transfer_owner(%L) $$, :'asha_id'), 'owner role moves to an existing user');
select is((select array_agg(user_id::text order by user_id) from public.profiles where role = 'owner'),
          array[:'asha_id'::text], 'exactly one owner after transfer: the new one');
select is((select count(*)::int from public.audit_events where action = 'owner_recovered' and target_id = :'asha_id'), 1,
          'transfer is audited');
-- To an email without an account: an owner invitation, accepted, hands over the role.
select tests.create_user('admin.recovered@example.com', 'owner') as recovered_id \gset
select is((select array_agg(user_id::text) from public.profiles where role = 'owner'),
          array[:'recovered_id'::text], 'accepting an owner invitation moves the role; previous owner is a member');
select is((select count(*)::int from public.audit_events where action = 'owner_recovered' and target_id = :'recovered_id'), 1,
          'recovery by invitation is audited');

-- ------------------------------------------------ Server-only
select tests.authenticate_as(:'owner_id');
select throws_ok($$ select * from app.admin_list_users() $$, '42501', null,
                 'admin functions are not callable from the client, even by the owner');

select * from finish();
rollback;
