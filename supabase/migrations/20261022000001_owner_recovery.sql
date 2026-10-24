-- T097 / FR-013a: owner recovery to an email that has no account yet. scripts/env-recover-owner.ts
-- (service role only) issues an owner invitation; when it is accepted the owner role moves to the
-- new account: the previous owner becomes a member (keeping only their own data) and the move is
-- audited as `owner_recovered`. Owner invitations can only be created with the service role.

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_invitation public.invitations%rowtype;
  v_previous_owner uuid;
begin
  select * into v_invitation
    from public.invitations i
   where i.email = v_email
     and i.status = 'pending'
     and i.expires_at > now()
   for update;

  if not found then
    raise exception 'INVITE_REQUIRED' using errcode = '42501';
  end if;

  if v_invitation.role = 'owner' then
    -- Rule 10 (single owner): hand the role over instead of failing on the unique index.
    update public.profiles set role = 'member' where role = 'owner'
    returning user_id into v_previous_owner;
  end if;

  insert into public.profiles (user_id, email, role)
  values (new.id, v_email, v_invitation.role);

  insert into public.user_preferences (user_id) values (new.id);

  update public.invitations
     set status = 'accepted', accepted_at = now(), accepted_user_id = new.id
   where id = v_invitation.id;

  perform app.write_audit(
    'invitation_accepted', new.id, v_email, 'invitation', v_invitation.id, v_email,
    null, jsonb_build_object('provider', coalesce(new.raw_app_meta_data ->> 'provider', 'email')));

  if v_previous_owner is not null then
    perform app.write_audit('owner_recovered', null, 'env-recover-owner', 'user', new.id, v_email,
                            null, jsonb_build_object('previousOwner', v_previous_owner));
  end if;

  return new;
end;
$$;
