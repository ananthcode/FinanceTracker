-- T053 Records a sign-in that completed in the client (Google OAuth), for the signed-in user only.
-- Password sign-ins are recorded by the server endpoint instead.

create or replace function app.record_sign_in(p_method text, p_device text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_method not in ('google', 'password') or p_device not in ('web', 'android') then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023';
  end if;
  select p.email::text into v_email from public.profiles p where p.user_id = v_user and p.status = 'active';
  if v_email is null then
    raise exception 'USER_INACTIVE' using errcode = '42501';
  end if;

  update public.profiles set last_sign_in_at = now() where user_id = v_user;
  perform app.write_audit('sign_in_succeeded', v_user, v_email, 'session', v_user, null, p_device,
                          jsonb_build_object('method', p_method));
end;
$$;

revoke execute on function app.record_sign_in(text, text) from public, anon;
grant execute on function app.record_sign_in(text, text) to authenticated;
