-- Fix: compare emails in lower case inside the user-created trigger. With `search_path = ''` the
-- citext `=` operator is not visible, so `email = x::citext` fell back to case-sensitive text
-- comparison. All stored emails are lower case, so lower() on the incoming value is sufficient.

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_invitation public.invitations%rowtype;
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

  insert into public.profiles (user_id, email, role)
  values (new.id, v_email, v_invitation.role);

  insert into public.user_preferences (user_id) values (new.id);

  update public.invitations
     set status = 'accepted', accepted_at = now(), accepted_user_id = new.id
   where id = v_invitation.id;

  perform app.write_audit(
    'invitation_accepted', new.id, v_email, 'invitation', v_invitation.id, v_email,
    null, jsonb_build_object('provider', coalesce(new.raw_app_meta_data ->> 'provider', 'email')));

  return new;
end;
$$;
