-- T010, T021 Load the demo household (R5 US1, US3; FR-001 – FR-006, FR-013; research R5-01).
--
-- REVIEW (constitution workflow — RLS, sync): SECURITY DEFINER, for auth.uid() only. Each change goes
-- through app._apply_one — the push applier, with its validation, stamping, field versions and history
-- — so a load can do nothing a push could not; the function adds only the "empty data" rule, the
-- all-or-nothing rule and the per-user lock (at most once). The demo environment rule is the API
-- route's (research R5-04): loading here is no more than pushing the same changes.

create or replace function app._load_demo(p_user uuid, p_changes jsonb, p_device text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change jsonb;
  v_result jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_entity text;
begin
  if p_device is null or p_device not in ('web', 'android') then
    raise exception 'VALIDATION_FAILED';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'VALIDATION_FAILED';
  end if;
  if jsonb_array_length(p_changes) not between 1 and 5000 then
    raise exception 'VALIDATION_FAILED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sync:' || p_user::text, 0));

  -- Only into empty data (clarify Q2): any row, deleted ones included.
  if exists (select 1 from public.accounts where user_id = p_user)
     or exists (select 1 from public.account_groups where user_id = p_user)
     or exists (select 1 from public.categories where user_id = p_user)
     or exists (select 1 from public.tags where user_id = p_user)
     or exists (select 1 from public.payees where user_id = p_user)
     or exists (select 1 from public.transactions where user_id = p_user)
     or exists (select 1 from public.person_rates where user_id = p_user) then
    raise exception 'NOT_EMPTY';
  end if;

  perform set_config('app.device_type', p_device, true);
  for v_change in select e.value from jsonb_array_elements(p_changes) with ordinality e order by e.ordinality loop
    v_result := app._apply_one(p_user, v_change, now());
    if v_result ->> 'status' is distinct from 'applied' then
      -- All or nothing: one refused change undoes the whole load.
      raise exception 'DEMO_REJECTED';
    end if;
    if v_change ->> 'kind' = 'create' then
      v_entity := v_change ->> 'entity';
      v_counts := jsonb_set(v_counts, array[v_entity], to_jsonb(coalesce((v_counts ->> v_entity)::int, 0) + 1));
    end if;
  end loop;
  perform set_config('app.change_context', '', true);

  -- The demo categories stand for the start choice (FR-006).
  update public.user_preferences p set categories_start = 'suggested' where p.user_id = p_user;
  perform app.write_audit('demo_data_loaded'::public.audit_action, auth.uid(), null, 'user', p_user, null, p_device,
                          jsonb_build_object('ownerId', p_user, 'counts', v_counts));
  perform set_config('app.device_type', '', true);
  return v_counts;
end;
$$;

create or replace function app.load_demo_data(p_changes jsonb, p_device text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  return jsonb_build_object('loaded', app._load_demo(auth.uid(), p_changes, p_device));
end;
$$;

-- US3: both in one transaction — a refused load keeps the old data (FR-013).
create or replace function app.reset_and_load_demo(p_changes jsonb, p_device text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed jsonb;
begin
  if auth.uid() is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  v_removed := app._reset_user_data(auth.uid(), p_device);
  return jsonb_build_object('removed', v_removed, 'loaded', app._load_demo(auth.uid(), p_changes, p_device));
end;
$$;

revoke execute on function app._load_demo(uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function app.load_demo_data(jsonb, text) from public, anon;
revoke execute on function app.reset_and_load_demo(jsonb, text) from public, anon;
grant execute on function app.load_demo_data(jsonb, text) to authenticated;
grant execute on function app.reset_and_load_demo(jsonb, text) to authenticated;
