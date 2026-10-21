-- T046 Auth hooks and user-creation trigger (database rule 7, FR-001, FR-004, FR-009, FR-015).
begin;
select plan(17);
select tests.as_superuser();

-- Helper: build a Before User Created event.
create or replace function pg_temp.user_event(p_email text, p_provider text default 'email', p_verified boolean default true)
returns jsonb language sql as $$
  select jsonb_build_object('user', jsonb_build_object(
    'email', p_email,
    'app_metadata', jsonb_build_object('provider', p_provider),
    'user_metadata', jsonb_build_object('email_verified', p_verified)));
$$;

create or replace function pg_temp.invite(p_email text, p_status public.invitation_status default 'pending',
                                          p_expires interval default interval '7 days')
returns uuid language sql as $$
  insert into public.invitations (email, token_hash, status, created_at, expires_at)
  values (p_email, extensions.digest(gen_random_uuid()::text, 'sha256'), p_status,
          now() - interval '8 days', now() - interval '8 days' + interval '1 second' + p_expires + interval '8 days')
  returning id;
$$;

-- ------------------------------------------------ Before User Created
select pg_temp.invite('asha.test@example.com');
select is(app.hook_before_user_created(pg_temp.user_event('asha.test@example.com')), '{}'::jsonb,
          'pending invitation allows sign-up');
select is(app.hook_before_user_created(pg_temp.user_event('Asha.Test@Example.com')), '{}'::jsonb,
          'email match is case-insensitive');
select is(app.hook_before_user_created(pg_temp.user_event('ravi.test@example.com')) -> 'error' ->> 'message',
          'INVITE_REQUIRED', 'uninvited email is rejected');

select pg_temp.invite('expired.test@example.com', 'pending', interval '-1 day');
select is(app.hook_before_user_created(pg_temp.user_event('expired.test@example.com')) -> 'error' ->> 'message',
          'INVITE_REQUIRED', 'expired invitation is rejected');

select pg_temp.invite('revoked.test@example.com', 'revoked');
select is(app.hook_before_user_created(pg_temp.user_event('revoked.test@example.com')) -> 'error' ->> 'message',
          'INVITE_REQUIRED', 'revoked invitation is rejected');

select pg_temp.invite('superseded.test@example.com', 'superseded');
select is(app.hook_before_user_created(pg_temp.user_event('superseded.test@example.com')) -> 'error' ->> 'message',
          'INVITE_REQUIRED', 'superseded invitation is rejected');

select pg_temp.invite('google.test@example.com');
select is(app.hook_before_user_created(pg_temp.user_event('google.test@example.com', 'google', false)) -> 'error' ->> 'message',
          'INVITE_REQUIRED', 'Google identity with unverified email is rejected (FR-004)');
select is(app.hook_before_user_created(pg_temp.user_event('google.test@example.com', 'google', true)), '{}'::jsonb,
          'Google identity with verified, invited email is allowed');

-- ------------------------------------------------ Trigger: profile + preferences + accepted
select tests.create_user('meera.test@example.com') as meera_id \gset
select is((select role::text from public.profiles where user_id = :'meera_id'), 'member', 'trigger creates a member profile');
select is((select base_currency::text from public.user_preferences where user_id = :'meera_id'), 'INR',
          'trigger creates default preferences (INR)');
select is((select status::text from public.invitations where accepted_user_id = :'meera_id'), 'accepted',
          'trigger marks the invitation accepted');
select is((select count(*)::int from public.audit_events where action = 'invitation_accepted' and actor_id = :'meera_id'), 1,
          'acceptance is audited');

-- Defence in depth: a user created without a pending invitation is refused (also covers
-- revoke-vs-accept races: once revoked, creation fails).
update public.invitations set status = 'revoked', revoked_at = now() where email = 'asha.test@example.com';
select throws_ok($$
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          'asha.test@example.com', '{"provider":"email"}', now(), now())
$$, '42501', 'INVITE_REQUIRED', 'creating a user after the invitation was revoked fails');

-- ------------------------------------------------ Custom Access Token hook
select is(app.hook_custom_access_token(jsonb_build_object(
            'user_id', :'meera_id', 'authentication_method', 'password', 'claims', '{"sub":"x"}'::jsonb))
          -> 'claims' ->> 'app_role', 'member', 'token hook adds the app_role claim');

insert into private.sign_in_attempts (email, failed_count, locked_until)
values ('meera.test@example.com', 5, now() + interval '15 minutes');
select is(app.hook_custom_access_token(jsonb_build_object(
            'user_id', :'meera_id', 'authentication_method', 'password', 'claims', '{}'::jsonb))
          -> 'error' ->> 'message', 'LOCKED', 'token hook refuses a locked email (FR-009)');
delete from private.sign_in_attempts;

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
values ('google-sub-1', :'meera_id',
        jsonb_build_object('sub', 'google-sub-1', 'email', 'meera.other@example.com', 'email_verified', true),
        'google', now(), now());
select is(app.hook_custom_access_token(jsonb_build_object(
            'user_id', :'meera_id', 'authentication_method', 'oauth', 'claims', '{}'::jsonb))
          -> 'error' ->> 'message', 'INVITE_REQUIRED',
          'token hook refuses a Google sign-in whose email no longer matches (FR-004)');

update public.profiles set status = 'disabled' where user_id = :'meera_id';
select is(app.hook_custom_access_token(jsonb_build_object(
            'user_id', :'meera_id', 'authentication_method', 'password', 'claims', '{}'::jsonb))
          -> 'error' ->> 'message', 'USER_INACTIVE', 'token hook refuses a disabled user (FR-015)');

select * from finish();
rollback;
