-- T028 Erasure also deletes the erased user's account history (FR-029, research R2-08).
-- Account and group history holds financial details (names, amounts), so it is deleted rather than
-- scrubbed. Accounts, groups and applied changes go by cascade when the auth user is deleted.
-- Otherwise unchanged from 20261021000003_admin.sql.

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

  delete from public.audit_events
   where target_type in ('account', 'account_group')
     and details ->> 'ownerId' = p_user::text;

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
