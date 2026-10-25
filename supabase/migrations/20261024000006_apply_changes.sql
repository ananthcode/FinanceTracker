-- T026 The single write path for synced records (contracts/database.md, contracts/sync-protocol.md).
--
-- REVIEW (constitution workflow — RLS / sync / money): app.apply_changes is SECURITY DEFINER and
-- therefore bypasses row-level security. Every statement below is scoped to the caller with
-- `user_id = p_user` where p_user = auth.uid(); an id that belongs to anyone else is reported as
-- NOT_FOUND (or rejected on create) and never read or written. Only apply_changes and
-- merge_field_versions are executable by clients; the _apply_* helpers are internal.

-- ---------------------------------------------------------------- per-field merge (R2-02)
-- SQL twin of mergeFields() in packages/core/src/sync/merge.ts; both run the shared vectors.
create or replace function app.merge_field_versions(
  p_versions jsonb, p_fields text[], p_hlc text, p_received_at timestamptz)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_limit    bigint := floor(extract(epoch from p_received_at) * 1000)::bigint + 300000;
  v_hlc      text := p_hlc;
  v_clamped  boolean := false;
  v_versions jsonb := coalesce(p_versions, '{}'::jsonb);
  v_applied  text[] := '{}';
  v_ignored  text[] := '{}';
  v_field    text;
begin
  if p_hlc is null or p_hlc !~ '^\d{13}\.\d{4}\.[a-z0-9]{8,32}$' then
    raise exception 'VALIDATION_FAILED';
  end if;
  -- A device clock may run at most 5 minutes ahead of the server (R2-02).
  if split_part(p_hlc, '.', 1)::bigint > v_limit then
    v_hlc := lpad(v_limit::text, 13, '0') || '.' || split_part(p_hlc, '.', 2) || '.' || split_part(p_hlc, '.', 3);
    v_clamped := true;
  end if;
  for v_field in select distinct f collate "C" from unnest(p_fields) f order by 1 loop
    -- A strictly newer HLC wins; fixed-width HLCs compare correctly as bytes.
    if not (v_versions ? v_field) or (v_hlc collate "C") > ((v_versions ->> v_field) collate "C") then
      v_versions := jsonb_set(v_versions, array[v_field], to_jsonb(v_hlc));
      v_applied := v_applied || v_field;
    else
      v_ignored := v_ignored || v_field;
    end if;
  end loop;
  return jsonb_build_object('applied', to_jsonb(v_applied), 'ignored', to_jsonb(v_ignored),
                            'fieldVersions', v_versions, 'hlc', v_hlc, 'clamped', v_clamped);
end;
$$;

-- ---------------------------------------------------------------- helpers
-- Records the change context read by audit.capture_record_change() for the next write.
create or replace function app._set_change_context(p_change_id uuid, p_merge jsonb, p_renamed boolean)
returns void
language sql
set search_path = ''
as $$
  select set_config('app.change_context',
    jsonb_build_object('changeId', p_change_id, 'hlc', p_merge ->> 'hlc',
                       'clamped', coalesce((p_merge ->> 'clamped')::boolean, false), 'renamed', p_renamed)::text, true);
$$;

create or replace function app._change_result(p_status text, p_merge jsonb, p_renamed text default null)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
           'status', p_status,
           'appliedFields', coalesce(p_merge -> 'applied', '[]'::jsonb),
           'ignoredFields', coalesce(p_merge -> 'ignored', '[]'::jsonb),
           'clamped', coalesce((p_merge ->> 'clamped')::boolean, false))
      || case when p_renamed is null then '{}'::jsonb else jsonb_build_object('renamedTo', p_renamed) end;
$$;

-- Next free "name (n)" within p_max characters (FR-032).
create or replace function app._free_account_name(p_user uuid, p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_n int := 2;
  v_suffix text;
  v_candidate text;
begin
  loop
    v_suffix := ' (' || v_n || ')';
    v_candidate := rtrim(left(p_name, 40 - char_length(v_suffix))) || v_suffix;
    exit when not exists (select 1 from public.accounts a
                           where a.user_id = p_user and lower(a.name) = lower(v_candidate) and a.state <> 'deleted');
    v_n := v_n + 1;
  end loop;
  return v_candidate;
end;
$$;

create or replace function app._free_group_name(p_user uuid, p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_n int := 2;
  v_suffix text;
  v_candidate text;
begin
  loop
    v_suffix := ' (' || v_n || ')';
    v_candidate := rtrim(left(p_name, 30 - char_length(v_suffix))) || v_suffix;
    exit when not exists (select 1 from public.account_groups g
                           where g.user_id = p_user and lower(g.name) = lower(v_candidate) and g.state = 'active');
    v_n := v_n + 1;
  end loop;
  return v_candidate;
end;
$$;

-- ---------------------------------------------------------------- accounts
create or replace function app._apply_account(
  p_user uuid, p_id uuid, p_kind text, p_fields jsonb, p_hlc text, p_options jsonb,
  p_received_at timestamptz, p_change_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_allowed  constant text[] := array['name', 'type', 'openingBalanceMinor', 'openingBalanceDate', 'colour', 'icon',
                                      'sortKey', 'groupId', 'includeInNetWorth', 'notes', 'creditLimitMinor'];
  c_required constant text[] := array['name', 'type', 'openingBalanceMinor', 'openingBalanceDate', 'colour', 'icon', 'sortKey'];
  r          public.accounts%rowtype;
  v_exists   boolean;
  v_keys     text[];
  v_merge    jsonb;
  v_applied  text[];
  v_versions jsonb;
  v_renamed  text;
  v_name     text;
  v_type     public.account_type;
  v_credit   bigint;
  v_group    uuid;
  v_tz       text;
  v_currency text;
begin
  if p_kind not in ('create', 'update', 'archive', 'restore', 'delete') or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'VALIDATION_FAILED';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_fields) k;
  if not (v_keys <@ c_allowed) then
    raise exception 'VALIDATION_FAILED';
  end if;
  if p_kind in ('archive', 'restore', 'delete') and cardinality(v_keys) > 0 then
    raise exception 'VALIDATION_FAILED';
  end if;

  -- Never touch another user's row.
  if exists (select 1 from public.accounts a where a.id = p_id and a.user_id <> p_user) then
    raise exception '%', case when p_kind = 'create' then 'VALIDATION_FAILED' else 'NOT_FOUND' end;
  end if;

  select * into r from public.accounts a where a.id = p_id and a.user_id = p_user for update;
  v_exists := found;
  if v_exists and r.state = 'deleted' then
    raise exception 'NOT_FOUND';
  end if;

  select p.timezone, p.base_currency into v_tz, v_currency from public.user_preferences p where p.user_id = p_user;

  if p_fields ? 'openingBalanceDate'
     and (p_fields ->> 'openingBalanceDate')::date > (p_received_at at time zone coalesce(v_tz, 'Asia/Kolkata'))::date then
    raise exception 'DATE_IN_FUTURE';
  end if;

  -- A group must be one of the caller's; a deleted group means "no group" (data-model.md).
  if p_fields ? 'groupId' and jsonb_typeof(p_fields -> 'groupId') <> 'null' then
    select case when g.state = 'active' then g.id end into v_group
      from public.account_groups g where g.id = (p_fields ->> 'groupId')::uuid and g.user_id = p_user;
    if not found then
      raise exception 'VALIDATION_FAILED';
    end if;
  end if;

  -- ------------------------------------------------ create
  if p_kind = 'create' and not v_exists then
    if not (c_required <@ v_keys) then
      raise exception 'VALIDATION_FAILED';
    end if;
    if (select count(*) from public.accounts a where a.user_id = p_user and a.state <> 'deleted') >= 200 then
      raise exception 'LIMIT_REACHED';
    end if;
    v_name := p_fields ->> 'name';
    if exists (select 1 from public.accounts a
                where a.user_id = p_user and lower(a.name) = lower(v_name) and a.state <> 'deleted') then
      if coalesce(p_options ->> 'onNameConflict', 'reject') = 'suffix' then
        v_name := app._free_account_name(p_user, v_name);
        v_renamed := v_name;
      else
        raise exception 'NAME_TAKEN';
      end if;
    end if;
    -- Every field (and the state) starts at this change's version.
    v_merge := app.merge_field_versions('{}'::jsonb, c_allowed || array['state'], p_hlc, p_received_at);
    v_merge := jsonb_set(v_merge, '{applied}', to_jsonb(v_keys));
    perform app._set_change_context(p_change_id, v_merge, v_renamed is not null);
    insert into public.accounts (id, user_id, name, type, opening_balance_minor, opening_balance_date, currency,
                                 colour, icon, sort_key, group_id, include_in_net_worth, notes, credit_limit_minor,
                                 field_versions)
    values (p_id, p_user, v_name, (p_fields ->> 'type')::public.account_type,
            (p_fields ->> 'openingBalanceMinor')::bigint, (p_fields ->> 'openingBalanceDate')::date, v_currency,
            p_fields ->> 'colour', p_fields ->> 'icon', p_fields ->> 'sortKey', v_group,
            coalesce((p_fields ->> 'includeInNetWorth')::boolean, true), p_fields ->> 'notes',
            (p_fields ->> 'creditLimitMinor')::bigint, v_merge -> 'fieldVersions');
    return app._change_result(case when v_renamed is null then 'applied' else 'renamed' end, v_merge, v_renamed);
  end if;

  if not v_exists then
    raise exception 'NOT_FOUND';
  end if;

  -- ------------------------------------------------ update (also a create replayed for an existing row)
  if p_kind in ('create', 'update') then
    if cardinality(v_keys) = 0 then
      raise exception 'VALIDATION_FAILED';
    end if;
    v_merge := app.merge_field_versions(r.field_versions, v_keys, p_hlc, p_received_at);
    v_applied := array(select jsonb_array_elements_text(v_merge -> 'applied'));
    if cardinality(v_applied) = 0 then
      return app._change_result('applied', v_merge);
    end if;
    v_versions := v_merge -> 'fieldVersions';

    v_name := case when 'name' = any(v_applied) then p_fields ->> 'name' else r.name end;
    if 'name' = any(v_applied) and exists (
         select 1 from public.accounts a
          where a.user_id = p_user and a.id <> p_id and lower(a.name) = lower(v_name) and a.state <> 'deleted') then
      raise exception 'NAME_TAKEN';
    end if;

    v_type := case when 'type' = any(v_applied) then (p_fields ->> 'type')::public.account_type else r.type end;
    v_credit := case when 'creditLimitMinor' = any(v_applied) then (p_fields ->> 'creditLimitMinor')::bigint
                     else r.credit_limit_minor end;
    if v_type <> 'credit_card' and v_credit is not null then
      if 'creditLimitMinor' = any(v_applied) then
        raise exception 'VALIDATION_FAILED';
      end if;
      -- Changing a card to an owned type drops its credit limit (FR-006).
      v_credit := null;
      v_versions := jsonb_set(v_versions, '{creditLimitMinor}', to_jsonb(v_merge ->> 'hlc'));
    end if;

    perform app._set_change_context(p_change_id, v_merge, false);
    update public.accounts a set
      name                  = v_name,
      type                  = v_type,
      opening_balance_minor = case when 'openingBalanceMinor' = any(v_applied)
                                   then (p_fields ->> 'openingBalanceMinor')::bigint else a.opening_balance_minor end,
      opening_balance_date  = case when 'openingBalanceDate' = any(v_applied)
                                   then (p_fields ->> 'openingBalanceDate')::date else a.opening_balance_date end,
      colour                = case when 'colour' = any(v_applied) then p_fields ->> 'colour' else a.colour end,
      icon                  = case when 'icon' = any(v_applied) then p_fields ->> 'icon' else a.icon end,
      sort_key              = case when 'sortKey' = any(v_applied) then p_fields ->> 'sortKey' else a.sort_key end,
      group_id              = case when 'groupId' = any(v_applied) then v_group else a.group_id end,
      include_in_net_worth  = case when 'includeInNetWorth' = any(v_applied)
                                   then (p_fields ->> 'includeInNetWorth')::boolean else a.include_in_net_worth end,
      notes                 = case when 'notes' = any(v_applied) then p_fields ->> 'notes' else a.notes end,
      credit_limit_minor    = v_credit,
      field_versions        = v_versions
    where a.id = p_id and a.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  -- ------------------------------------------------ archive / restore / delete (state field)
  v_merge := app.merge_field_versions(r.field_versions, array['state'], p_hlc, p_received_at);
  if not ('state' = any(array(select jsonb_array_elements_text(v_merge -> 'applied')))) then
    return app._change_result('applied', v_merge);
  end if;
  perform app._set_change_context(p_change_id, v_merge, false);

  if p_kind = 'archive' then
    -- Archiving never changes net worth (FR-022).
    if r.state <> 'archived' and app.account_balance_minor(p_id) <> 0 then
      raise exception 'BALANCE_NOT_ZERO';
    end if;
    update public.accounts a set state = 'archived', archived_at = coalesce(a.archived_at, now()),
                                 field_versions = v_merge -> 'fieldVersions'
     where a.id = p_id and a.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  if p_kind = 'restore' then
    update public.accounts a set state = 'active', archived_at = null, field_versions = v_merge -> 'fieldVersions'
     where a.id = p_id and a.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  -- delete (FR-024, FR-034): only without activity; otherwise archive at zero, or refuse.
  if app.account_has_activity(p_id) then
    if app.account_balance_minor(p_id) <> 0 then
      raise exception 'HAS_ACTIVITY';
    end if;
    update public.accounts a set state = 'archived', archived_at = coalesce(a.archived_at, now()),
                                 field_versions = v_merge -> 'fieldVersions'
     where a.id = p_id and a.user_id = p_user;
    return app._change_result('converted', v_merge);
  end if;
  update public.accounts a set state = 'deleted', deleted_at = now(), field_versions = v_merge -> 'fieldVersions'
   where a.id = p_id and a.user_id = p_user;
  return app._change_result('applied', v_merge);
end;
$$;

-- ---------------------------------------------------------------- user groups
create or replace function app._apply_group(
  p_user uuid, p_id uuid, p_kind text, p_fields jsonb, p_hlc text, p_options jsonb,
  p_received_at timestamptz, p_change_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_allowed constant text[] := array['name', 'sortKey'];
  r         public.account_groups%rowtype;
  v_exists  boolean;
  v_keys    text[];
  v_merge   jsonb;
  v_applied text[];
  v_name    text;
  v_renamed text;
begin
  if p_kind not in ('create', 'update', 'delete') or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'VALIDATION_FAILED';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_fields) k;
  if not (v_keys <@ c_allowed) or (p_kind = 'delete' and cardinality(v_keys) > 0) then
    raise exception 'VALIDATION_FAILED';
  end if;

  if exists (select 1 from public.account_groups g where g.id = p_id and g.user_id <> p_user) then
    raise exception '%', case when p_kind = 'create' then 'VALIDATION_FAILED' else 'NOT_FOUND' end;
  end if;

  select * into r from public.account_groups g where g.id = p_id and g.user_id = p_user for update;
  v_exists := found;
  if v_exists and r.state = 'deleted' then
    raise exception 'NOT_FOUND';
  end if;

  if p_kind = 'create' and not v_exists then
    if not (c_allowed <@ v_keys) then
      raise exception 'VALIDATION_FAILED';
    end if;
    if (select count(*) from public.account_groups g where g.user_id = p_user and g.state = 'active') >= 30 then
      raise exception 'LIMIT_REACHED';
    end if;
    v_name := p_fields ->> 'name';
    if exists (select 1 from public.account_groups g
                where g.user_id = p_user and lower(g.name) = lower(v_name) and g.state = 'active') then
      if coalesce(p_options ->> 'onNameConflict', 'reject') = 'suffix' then
        v_name := app._free_group_name(p_user, v_name);
        v_renamed := v_name;
      else
        raise exception 'GROUP_NAME_TAKEN';
      end if;
    end if;
    v_merge := app.merge_field_versions('{}'::jsonb, c_allowed || array['state'], p_hlc, p_received_at);
    v_merge := jsonb_set(v_merge, '{applied}', to_jsonb(v_keys));
    perform app._set_change_context(p_change_id, v_merge, v_renamed is not null);
    insert into public.account_groups (id, user_id, name, sort_key, field_versions)
    values (p_id, p_user, v_name, p_fields ->> 'sortKey', v_merge -> 'fieldVersions');
    return app._change_result(case when v_renamed is null then 'applied' else 'renamed' end, v_merge, v_renamed);
  end if;

  if not v_exists then
    raise exception 'NOT_FOUND';
  end if;

  if p_kind in ('create', 'update') then
    if cardinality(v_keys) = 0 then
      raise exception 'VALIDATION_FAILED';
    end if;
    v_merge := app.merge_field_versions(r.field_versions, v_keys, p_hlc, p_received_at);
    v_applied := array(select jsonb_array_elements_text(v_merge -> 'applied'));
    if cardinality(v_applied) = 0 then
      return app._change_result('applied', v_merge);
    end if;
    v_name := case when 'name' = any(v_applied) then p_fields ->> 'name' else r.name end;
    if 'name' = any(v_applied) and exists (
         select 1 from public.account_groups g
          where g.user_id = p_user and g.id <> p_id and lower(g.name) = lower(v_name) and g.state = 'active') then
      raise exception 'GROUP_NAME_TAKEN';
    end if;
    perform app._set_change_context(p_change_id, v_merge, false);
    update public.account_groups g set
      name           = v_name,
      sort_key       = case when 'sortKey' = any(v_applied) then p_fields ->> 'sortKey' else g.sort_key end,
      field_versions = v_merge -> 'fieldVersions'
    where g.id = p_id and g.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  -- delete (FR-009b): the group goes; its accounts move to "Ungrouped" and nothing else changes.
  v_merge := app.merge_field_versions(r.field_versions, array['state'], p_hlc, p_received_at);
  if not ('state' = any(array(select jsonb_array_elements_text(v_merge -> 'applied')))) then
    return app._change_result('applied', v_merge);
  end if;
  perform app._set_change_context(p_change_id, v_merge, false);
  update public.account_groups g set state = 'deleted', deleted_at = now(), field_versions = v_merge -> 'fieldVersions'
   where g.id = p_id and g.user_id = p_user;
  update public.accounts a set group_id = null,
                               field_versions = jsonb_set(a.field_versions, '{groupId}', to_jsonb(v_merge ->> 'hlc'))
   where a.group_id = p_id and a.user_id = p_user;
  return app._change_result('applied', v_merge);
end;
$$;

-- ---------------------------------------------------------------- one change, exactly once (R2-03)
create or replace function app._apply_one(p_user uuid, p_change jsonb, p_received_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_codes      constant text[] := array['VALIDATION_FAILED', 'NAME_TAKEN', 'GROUP_NAME_TAKEN', 'BALANCE_NOT_ZERO',
                                        'HAS_ACTIVITY', 'LIMIT_REACHED', 'DATE_IN_FUTURE', 'NOT_FOUND'];
  v_change_id  uuid;
  v_stored     jsonb;
  v_result     jsonb;
  v_constraint text;
begin
  begin
    v_change_id := (p_change ->> 'changeId')::uuid;
  exception when others then
    v_change_id := null;
  end;
  if v_change_id is null then
    return jsonb_build_object('changeId', p_change ->> 'changeId', 'status', 'rejected', 'code', 'VALIDATION_FAILED',
                              'appliedFields', '[]'::jsonb, 'ignoredFields', '[]'::jsonb, 'clamped', false);
  end if;

  insert into private.applied_changes (user_id, change_id) values (p_user, v_change_id) on conflict do nothing;
  if not found then
    select c.result into v_stored from private.applied_changes c where c.user_id = p_user and c.change_id = v_change_id;
    return v_stored || jsonb_build_object('status', 'duplicate');
  end if;

  -- Each change runs in its own subtransaction: a refused change is rolled back alone.
  begin
    v_result := case p_change ->> 'entity'
      when 'account' then app._apply_account(p_user, (p_change ->> 'entityId')::uuid, p_change ->> 'kind',
                                             coalesce(p_change -> 'fields', '{}'::jsonb), p_change ->> 'hlc',
                                             p_change -> 'options', p_received_at, v_change_id)
      when 'account_group' then app._apply_group(p_user, (p_change ->> 'entityId')::uuid, p_change ->> 'kind',
                                                 coalesce(p_change -> 'fields', '{}'::jsonb), p_change ->> 'hlc',
                                                 p_change -> 'options', p_received_at, v_change_id)
    end;
    if v_result is null then
      raise exception 'VALIDATION_FAILED';
    end if;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      v_result := jsonb_build_object('status', 'rejected', 'code',
                    case when v_constraint like 'account_groups%' then 'GROUP_NAME_TAKEN'
                         when v_constraint = 'accounts_name_unique' then 'NAME_TAKEN'
                         else 'VALIDATION_FAILED' end);
    when raise_exception then
      v_result := jsonb_build_object('status', 'rejected', 'code',
                    case when sqlerrm = any(c_codes) then sqlerrm else 'VALIDATION_FAILED' end);
    when integrity_constraint_violation or data_exception then
      v_result := jsonb_build_object('status', 'rejected', 'code', 'VALIDATION_FAILED');
  end;

  v_result := jsonb_build_object('changeId', v_change_id, 'appliedFields', '[]'::jsonb,
                                 'ignoredFields', '[]'::jsonb, 'clamped', false) || v_result;
  update private.applied_changes c set result = v_result where c.user_id = p_user and c.change_id = v_change_id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------- entry point
create or replace function app.apply_changes(p_changes jsonb, p_device text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_results jsonb := '[]'::jsonb;
  v_change  jsonb;
begin
  if v_user is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  if p_device is null or p_device not in ('web', 'android') then
    raise exception 'VALIDATION_FAILED';
  end if;
  -- Two checks: SQL does not promise short-circuit evaluation of OR.
  if jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'VALIDATION_FAILED';
  end if;
  if jsonb_array_length(p_changes) not between 1 and 100 then
    raise exception 'VALIDATION_FAILED';
  end if;

  perform set_config('app.device_type', p_device, true);
  for v_change in select e.value from jsonb_array_elements(p_changes) with ordinality e order by e.ordinality loop
    v_results := v_results || jsonb_build_array(app._apply_one(v_user, v_change, now()));
  end loop;
  perform set_config('app.change_context', '', true);
  perform set_config('app.device_type', '', true);
  return v_results;
end;
$$;

revoke execute on function app.merge_field_versions(jsonb, text[], text, timestamptz) from public, anon;
revoke execute on function app._set_change_context(uuid, jsonb, boolean) from public, anon, authenticated;
revoke execute on function app._change_result(text, jsonb, text) from public, anon, authenticated;
revoke execute on function app._free_account_name(uuid, text) from public, anon, authenticated;
revoke execute on function app._free_group_name(uuid, text) from public, anon, authenticated;
revoke execute on function app._apply_account(uuid, uuid, text, jsonb, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function app._apply_group(uuid, uuid, text, jsonb, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function app._apply_one(uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function app.apply_changes(jsonb, text) from public, anon;

-- merge_field_versions is pure and reveals nothing; it is callable for the parity test.
grant execute on function app.merge_field_versions(jsonb, text[], text, timestamptz) to authenticated, service_role;
grant execute on function app.apply_changes(jsonb, text) to authenticated;
