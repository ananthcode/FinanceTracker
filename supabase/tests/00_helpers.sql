-- T023 pgTAP helpers, created in a `tests` schema of the LOCAL database only.
-- Runs first (file name order); later test files call these functions.
begin;
select plan(1);

create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Creates an invited, accepted user through the real trigger path; returns the user id.
create or replace function tests.create_user(p_email text, p_role public.user_role default 'member')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.invitations (email, role, token_hash)
  values (lower(p_email), p_role, extensions.digest(gen_random_uuid()::text, 'sha256'));

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
          lower(p_email), extensions.crypt('not-used-in-tests', extensions.gen_salt('bf')),
          now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
  return v_id;
end;
$$;

-- Impersonates a signed-in user for the rest of the transaction.
create or replace function tests.authenticate_as(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Returns to the superuser context used for setup.
create or replace function tests.as_superuser()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select pass('test helpers installed');
select * from finish();
commit;
