-- T089 Owner-admin functions (US4; FR-013a–FR-016a, FR-039; constitution I and III as amended).
-- All are service-role only: the owner reaches them through server endpoints that verify the
-- caller is the owner. None of them returns any user's financial data or preferences.

-- FR-014: users with exactly these fields — nothing else.
create or replace function app.admin_list_users()
returns table (
  user_id         uuid,
  email           text,
  display_name    text,
  status          public.access_status,
  role            public.user_role,
  last_sign_in_at timestamptz,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.email::text, p.display_name, p.status, p.role, p.last_sign_in_at, p.created_at
    from public.profiles p
   order by p.created_at;
$$;

-- FR-039: invitation and access-change events for everyone (not other users' sign-ins).
create or replace function app.admin_audit_feed(p_cursor bigint default null, p_limit integer default 50)
returns table (id bigint, occurred_at timestamptz, action public.audit_action, actor_ref text, target_ref text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.occurred_at, e.action, e.actor_ref, e.target_ref
    from public.audit_events e
   where e.action in ('invitation_created', 'invitation_resent', 'invitation_revoked', 'invitation_accepted',
                      'invitation_expired', 'invitation_delivery_failed', 'owner_recovered',
                      'user_disabled', 'user_enabled', 'user_erased')
     and (p_cursor is null or e.id < p_cursor)
   order by e.id desc
   limit least(greatest(p_limit, 1), 200);
$$;

-- FR-015: disable / re-enable any user except the owner. Data access stops at once through
-- app.is_active_user() in every policy; the endpoint also bans the auth user.
create or replace function app.set_user_status(p_user uuid, p_status public.access_status, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_actor_email text;
begin
  select * into v_profile from public.profiles where user_id = p_user for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_profile.role = 'owner' then
    raise exception 'CANNOT_TARGET_OWNER';
  end if;
  if p_status = 'active' and v_profile.status <> 'disabled' then
    raise exception 'NOT_DISABLED';
  end if;
  if p_status = v_profile.status then
    return; -- disabling an already-disabled user is a no-op
  end if;

  update public.profiles set status = p_status where user_id = p_user;
  select email::text into v_actor_email from public.profiles where user_id = p_actor;
  perform app.write_audit(
    case when p_status = 'disabled' then 'user_disabled' else 'user_enabled' end::public.audit_action,
    p_actor, v_actor_email, 'user', p_user, v_profile.email::text, null, '{}'::jsonb);
end;
$$;

-- FR-016a / SC-009: removes an erased user's identifiers from earlier audit events and deletes every
-- invitation and lockout record for their email. Returns the opaque reference used in their place.
-- This is the ONLY function that modifies audit rows (constitution III(b)).
create or replace function app.scrub_user_from_audit(p_user uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(p_email);
  v_ref text := 'erased:' || gen_random_uuid()::text;
  v_digest text := encode(extensions.digest(lower(p_email), 'sha256'), 'hex');
begin
  if exists (select 1 from public.profiles where user_id = p_user and role = 'owner') then
    raise exception 'CANNOT_TARGET_OWNER';
  end if;

  update public.audit_events
     set actor_id  = case when actor_id = p_user then null else actor_id end,
         target_id = case when target_id = p_user then null else target_id end,
         actor_ref = case when actor_id = p_user or lower(actor_ref) = v_email then v_ref else actor_ref end,
         target_ref = case when target_id = p_user or lower(target_ref) = v_email then v_ref else target_ref end,
         details   = details - 'emailRef'
   where actor_id = p_user or target_id = p_user
      or lower(actor_ref) = v_email or lower(target_ref) = v_email
      or details ->> 'emailRef' = v_digest;

  delete from public.invitations where email = v_email;
  delete from private.sign_in_attempts where email = v_email;
  delete from private.rate_limits where bucket = 'reset:' || v_digest;
  return v_ref;
end;
$$;

-- FR-013a: moves the owner role to another existing user (used by scripts/env-recover-owner.ts).
create or replace function app.transfer_owner(p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
  v_new_email text;
begin
  select email::text into v_new_email from public.profiles where user_id = p_new_owner;
  if v_new_email is null then
    raise exception 'NOT_FOUND';
  end if;
  select user_id into v_old from public.profiles where role = 'owner';
  update public.profiles set role = 'member' where role = 'owner';
  update public.profiles set role = 'owner', status = 'active' where user_id = p_new_owner;
  perform app.write_audit('owner_recovered', null, 'env-recover-owner', 'user', p_new_owner, v_new_email,
                          null, jsonb_build_object('previousOwner', v_old));
end;
$$;

revoke execute on function app.admin_list_users() from public, anon, authenticated;
revoke execute on function app.admin_audit_feed(bigint, integer) from public, anon, authenticated;
revoke execute on function app.set_user_status(uuid, public.access_status, uuid) from public, anon, authenticated;
revoke execute on function app.scrub_user_from_audit(uuid, text) from public, anon, authenticated;
revoke execute on function app.transfer_owner(uuid) from public, anon, authenticated;
grant execute on function app.admin_list_users() to service_role;
grant execute on function app.admin_audit_feed(bigint, integer) to service_role;
grant execute on function app.set_user_status(uuid, public.access_status, uuid) to service_role;
grant execute on function app.scrub_user_from_audit(uuid, text) to service_role;
grant execute on function app.transfer_owner(uuid) to service_role;
