-- T019 Append-only audit history (FR-037, FR-038, constitution III).

create table public.audit_events (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_ref   text,
  action      public.audit_action not null,
  target_type text check (target_type in ('user', 'invitation', 'preferences', 'session')),
  target_id   uuid,
  target_ref  text,
  device_type text check (device_type in ('web', 'android')),
  details     jsonb not null default '{}'::jsonb
);

create index audit_events_actor_idx on public.audit_events (actor_id, occurred_at desc);
create index audit_events_target_idx on public.audit_events (target_id, occurred_at desc);

alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon, authenticated;
-- Clients may only read (policy added in access-rules migration); never insert/update/delete.
grant select on public.audit_events to authenticated;

-- Removes keys that must never be stored in audit details (FR-003a, FR-037).
create or replace function app.redact_details(p_details jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (select jsonb_object_agg(key, value)
       from jsonb_each(coalesce(p_details, '{}'::jsonb))
      where key !~* '(token|password|pin|secret|hash)'),
    '{}'::jsonb);
$$;

-- The only way rows are written (from triggers and SECURITY DEFINER functions / service role).
create or replace function app.write_audit(
  p_action      public.audit_action,
  p_actor_id    uuid,
  p_actor_ref   text,
  p_target_type text,
  p_target_id   uuid,
  p_target_ref  text,
  p_device_type text default null,
  p_details     jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events
    (actor_id, actor_ref, action, target_type, target_id, target_ref, device_type, details)
  values
    (p_actor_id, p_actor_ref, p_action, p_target_type, p_target_id, p_target_ref, p_device_type,
     app.redact_details(p_details));
end;
$$;

revoke execute on function app.write_audit(public.audit_action, uuid, text, text, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function app.write_audit(public.audit_action, uuid, text, text, uuid, text, text, jsonb)
  to service_role;

-- Generic before/after change capture, reused by later financial tables (constitution III).
-- TG_ARGV[0] = audit action, TG_ARGV[1] = target type.
create or replace function audit.capture_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb := app.redact_details(to_jsonb(old));
  v_after  jsonb := app.redact_details(to_jsonb(new));
  v_changed jsonb;
  v_actor uuid := auth.uid();
begin
  select coalesce(jsonb_object_agg(a.key, jsonb_build_object('before', v_before -> a.key, 'after', a.value)), '{}'::jsonb)
    into v_changed
    from jsonb_each(v_after) a
   where a.key not in ('updated_at')
     and (v_before -> a.key) is distinct from a.value;

  if v_changed <> '{}'::jsonb then
    perform app.write_audit(
      tg_argv[0]::public.audit_action,
      v_actor,
      (select p.email::text from public.profiles p where p.user_id = v_actor),
      tg_argv[1],
      (v_after ->> 'user_id')::uuid,
      null,
      null,
      jsonb_build_object('changes', v_changed));
  end if;
  return new;
end;
$$;
