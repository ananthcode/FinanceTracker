-- T020 Access rules: per-user isolation enforced in the database (constitution I, FR-017/FR-018).
-- Every policy on user data requires an *active* user, so disabling cuts access on the next request.

create or replace function app.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.status = 'active'
  );
$$;

revoke execute on function app.is_active_user() from public;
grant execute on function app.is_active_user() to anon, authenticated, service_role;

-- ---------------------------------------------------------------- profiles
grant select on public.profiles to authenticated;
-- Only the display name is client-updatable; role, status, setup and audit columns are server-side.
grant update (display_name) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- user_preferences
grant select on public.user_preferences to authenticated;
grant update (base_currency, number_format, date_format, fy_start_month, timezone)
  on public.user_preferences to authenticated;

create policy user_preferences_select_own on public.user_preferences
  for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

create policy user_preferences_update_own on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()))
  with check (user_id = (select auth.uid()));

create trigger user_preferences_capture_change
  after update on public.user_preferences
  for each row execute function audit.capture_change('preference_changed', 'preferences');

-- ---------------------------------------------------------------- audit_events
-- A user reads only their own sign-in activity (FR-039); owner feeds go through server functions.
create policy audit_events_own_sign_in on public.audit_events
  for select to authenticated
  using (
    actor_id = (select auth.uid())
    and action in ('sign_in_succeeded', 'sign_in_failed', 'sign_in_locked', 'signed_out')
    and (select app.is_active_user())
  );

-- ---------------------------------------------------------------- health (FR-019a, keep-alive)
create or replace function app.health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'ok',
    'environment', (select e.name from private.environment e where e.id = 1)
  );
$$;

revoke execute on function app.health() from public;
grant execute on function app.health() to anon, authenticated, service_role;
