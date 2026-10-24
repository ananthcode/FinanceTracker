-- T022 Supabase Auth hooks (research R-01, R-05, R-06; FR-001, FR-004, FR-009, FR-015).
-- Both are Postgres-function hooks executed by the supabase_auth_admin role.

-- Before User Created: invite-only for every creation path (email/password, Google, direct API).
create or replace function app.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email    text := lower(event -> 'user' ->> 'email');
  v_provider text := coalesce(event -> 'user' -> 'app_metadata' ->> 'provider', 'email');
  v_verified boolean := coalesce((event -> 'user' -> 'user_metadata' ->> 'email_verified')::boolean, false);
begin
  if v_email is null or v_email = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'INVITE_REQUIRED'));
  end if;

  -- FR-004: a Google identity must report a verified email.
  if v_provider = 'google' and not v_verified then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'INVITE_REQUIRED'));
  end if;

  if not exists (
    select 1 from public.invitations i
     where i.email = v_email::extensions.citext
       and i.status = 'pending'
       and i.expires_at > now()
  ) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'INVITE_REQUIRED'));
  end if;

  return '{}'::jsonb;
end;
$$;

-- Custom Access Token: refuse tokens for disabled users, locked emails, and Google sign-ins whose
-- identity email no longer matches (or is unverified); add the app_role claim.
create or replace function app.hook_custom_access_token(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (event ->> 'user_id')::uuid;
  v_method  text := event ->> 'authentication_method';
  v_claims  jsonb := event -> 'claims';
  v_profile public.profiles%rowtype;
  v_google  record;
begin
  select * into v_profile from public.profiles p where p.user_id = v_user_id;

  if not found or v_profile.status <> 'active' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 401, 'message', 'USER_INACTIVE'));
  end if;

  if exists (
    select 1 from private.sign_in_attempts a
     where a.email = v_profile.email and a.locked_until > now()
  ) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 423, 'message', 'LOCKED'));
  end if;

  if v_method = 'oauth' then
    for v_google in
      select i.identity_data from auth.identities i
       where i.user_id = v_user_id and i.provider = 'google'
    loop
      if lower(v_google.identity_data ->> 'email') is distinct from lower(v_profile.email::text)
         or coalesce((v_google.identity_data ->> 'email_verified')::boolean, false) is not true then
        return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'INVITE_REQUIRED'));
      end if;
    end loop;
  end if;

  v_claims := jsonb_set(v_claims, '{app_role}', to_jsonb(v_profile.role::text));
  return jsonb_build_object('claims', v_claims);
end;
$$;

-- Only the Auth service may execute the hooks.
revoke execute on function app.hook_before_user_created(jsonb) from public, anon, authenticated;
revoke execute on function app.hook_custom_access_token(jsonb) from public, anon, authenticated;
grant usage on schema app to supabase_auth_admin;
grant execute on function app.hook_before_user_created(jsonb) to supabase_auth_admin;
grant execute on function app.hook_custom_access_token(jsonb) to supabase_auth_admin;
