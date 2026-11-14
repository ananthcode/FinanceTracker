-- T003 Access rules, stamps and history for the plan (constitution I, III; research R7-09, R7-12).
--
-- REVIEW (constitution workflow — RLS): both tables are SELECT-only for their owner (active users);
-- writes go through app.apply_changes. The two new preference columns are client-updatable on the
-- user's own row only (existing update policy); the checked month only moves forward for clients.

alter table public.plan_items enable row level security;
alter table public.plan_occurrences enable row level security;
revoke all on public.plan_items, public.plan_occurrences from public, anon, authenticated;
grant select on public.plan_items, public.plan_occurrences to authenticated;

create policy plan_items_select_own on public.plan_items
  for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

create policy plan_occurrences_select_own on public.plan_occurrences
  for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

create trigger plan_items_stamp before insert or update on public.plan_items
  for each row execute function sync.stamp_row();
create trigger plan_items_capture_change after insert or update on public.plan_items
  for each row execute function audit.capture_record_change('plan_item');

create trigger plan_occurrences_stamp before insert or update on public.plan_occurrences
  for each row execute function sync.stamp_row();
create trigger plan_occurrences_capture_change after insert or update on public.plan_occurrences
  for each row execute function audit.capture_record_change('plan_month');

-- ---------------------------------------------------------------- preferences (FR-023)
grant update (plan_nudge, plan_checked_month) on public.user_preferences to authenticated;

-- "Plan checked" never moves back for a client (an old device sends an older month). Server-side
-- definer code (reset, erasure) runs as the owner and may clear it.
create or replace function app.keep_plan_checked_forward()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.plan_checked_month is distinct from old.plan_checked_month then
    new.plan_checked_month := greatest(old.plan_checked_month, new.plan_checked_month);
  end if;
  return new;
end;
$$;

create trigger user_preferences_plan_checked_forward
  before update of plan_checked_month on public.user_preferences
  for each row execute function app.keep_plan_checked_forward();

revoke execute on function app.keep_plan_checked_forward() from public, anon, authenticated;
revoke execute on function app._plan_occurrence_id(uuid, date) from public, anon;
grant execute on function app._plan_occurrence_id(uuid, date) to authenticated, service_role;
revoke execute on function app._plan_applies(date, date, smallint, date) from public, anon, authenticated;
