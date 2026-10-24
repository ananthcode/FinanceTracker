-- T066 Per-email lockout (FR-009, research R-05). Service role only; called by POST /api/auth/sign-in.
-- 5 consecutive failed password attempts since the last success → locked for 15 minutes.
-- Emails are normalised with lower(): with an empty search_path the citext `=` operator is not
-- visible, so comparisons fall back to case-sensitive text equality. Stored emails are lower case.

create or replace function app.sign_in_lock_status(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'locked', coalesce(a.locked_until > now(), false),
    'retryAfter', case when a.locked_until > now()
                       then ceil(extract(epoch from a.locked_until - now()))::int else 0 end)
  from (select 1) dummy
  left join private.sign_in_attempts a on a.email = lower(p_email);
$$;

create or replace function app.register_failed_sign_in(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(p_email);
  v_row   private.sign_in_attempts%rowtype;
  v_user  uuid;
begin
  -- A lock that has expired starts a fresh count.
  update private.sign_in_attempts
     set failed_count = 0, first_failed_at = null, locked_until = null
   where email = v_email and locked_until is not null and locked_until <= now();

  insert into private.sign_in_attempts as a (email, failed_count, first_failed_at)
  values (v_email, 1, now())
  on conflict (email) do update
    set failed_count = a.failed_count + 1,
        first_failed_at = coalesce(a.first_failed_at, now())
  returning * into v_row;

  -- Attribute the event to the account when it exists, so its owner can see it (FR-039).
  select p.user_id into v_user from public.profiles p where p.email = v_email;
  perform app.write_audit('sign_in_failed', v_user, v_email, 'session', v_user, null, null,
                          jsonb_build_object('method', 'password'));

  if v_row.failed_count >= 5 and v_row.locked_until is null then
    update private.sign_in_attempts set locked_until = now() + interval '15 minutes' where email = v_email
    returning * into v_row;
    perform app.write_audit('sign_in_locked', v_user, v_email, 'session', v_user, null, null,
                            jsonb_build_object('lockedMinutes', 15));
  end if;

  return jsonb_build_object(
    'locked', coalesce(v_row.locked_until > now(), false),
    'retryAfter', case when v_row.locked_until > now()
                       then ceil(extract(epoch from v_row.locked_until - now()))::int else 0 end);
end;
$$;

create or replace function app.clear_failed_sign_ins(p_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.sign_in_attempts where email = lower(p_email);
$$;

revoke execute on function app.sign_in_lock_status(text) from public, anon, authenticated;
revoke execute on function app.register_failed_sign_in(text) from public, anon, authenticated;
revoke execute on function app.clear_failed_sign_ins(text) from public, anon, authenticated;
grant execute on function app.sign_in_lock_status(text) to service_role;
grant execute on function app.register_failed_sign_in(text) to service_role;
grant execute on function app.clear_failed_sign_ins(text) to service_role;
