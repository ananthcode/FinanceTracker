-- T021 When an auth user is created: create profile + default preferences from the pending
-- invitation, mark the invitation accepted and audit it. Defence in depth behind the
-- Before User Created hook: a user without a pending, unexpired invitation is refused here too.

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
begin
  select * into v_invitation
    from public.invitations i
   where i.email = new.email::extensions.citext
     and i.status = 'pending'
     and i.expires_at > now()
   for update;

  if not found then
    raise exception 'INVITE_REQUIRED' using errcode = '42501';
  end if;

  insert into public.profiles (user_id, email, role)
  values (new.id, lower(new.email), v_invitation.role);

  insert into public.user_preferences (user_id) values (new.id);

  update public.invitations
     set status = 'accepted', accepted_at = now(), accepted_user_id = new.id
   where id = v_invitation.id;

  perform app.write_audit(
    'invitation_accepted', new.id, lower(new.email), 'invitation', v_invitation.id, lower(new.email),
    null, jsonb_build_object('provider', coalesce(new.raw_app_meta_data ->> 'provider', 'email')));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();
