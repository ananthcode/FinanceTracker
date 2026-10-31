-- T013, T028, T038, T049, T063, T064 Writes for categories, tags and payees through the single
-- write path (R3 contracts/database.md, contracts/sync-protocol.md, research R3-02 … R3-12).
--
-- REVIEW (constitution workflow — RLS / sync / money): the appliers below run inside
-- app.apply_changes, which is SECURITY DEFINER and so bypasses row-level security. Every statement
-- is scoped with `user_id = p_user` where p_user = auth.uid(); ids belonging to anyone else (as the
-- record, a parent, a default category or a merge target) are never read or written and are
-- reported NOT_FOUND / INVALID_MOVE / INVALID_MERGE / VALIDATION_FAILED. Merges repoint every
-- reference atomically; R4 must add its references (transactions, split lines, transaction tags)
-- to app._merge_category, app._merge_payee and app._merge_tag.

-- ---------------------------------------------------------------- helpers
-- Sets one field version to the later of the stored version and p_hlc (used when a merge or a
-- delete rewrites a field the change did not name, so a later edit still wins).
create or replace function app._bump_version(p_versions jsonb, p_field text, p_hlc text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when (p_versions ->> p_field) is not null and ((p_versions ->> p_field) collate "C") >= (p_hlc collate "C")
              then p_versions
              else jsonb_set(coalesce(p_versions, '{}'::jsonb), array[p_field], to_jsonb(p_hlc)) end;
$$;

-- Next free "name (n)" (FR-032) among a category's siblings / the user's tags / payees.
create or replace function app._free_category_name(p_user uuid, p_kind public.category_kind, p_parent uuid, p_name text)
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
    exit when not exists (select 1 from public.categories c
                           where c.user_id = p_user and c.kind = p_kind and c.parent_id is not distinct from p_parent
                             and lower(c.name) = lower(v_candidate) and c.state <> 'deleted');
    v_n := v_n + 1;
  end loop;
  return v_candidate;
end;
$$;

create or replace function app._free_tag_name(p_user uuid, p_name text)
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
    exit when not exists (select 1 from public.tags t
                           where t.user_id = p_user and lower(t.name) = lower(v_candidate) and t.state <> 'deleted');
    v_n := v_n + 1;
  end loop;
  return v_candidate;
end;
$$;

create or replace function app._free_payee_name(p_user uuid, p_name text)
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
    v_candidate := rtrim(left(p_name, 60 - char_length(v_suffix))) || v_suffix;
    exit when not exists (select 1 from public.payees p
                           where p.user_id = p_user and lower(p.name) = lower(v_candidate) and p.state <> 'deleted');
    v_n := v_n + 1;
  end loop;
  return v_candidate;
end;
$$;

-- The ids of a category and everything beneath it (non-deleted), for cycle and merge checks.
create or replace function app._category_subtree(p_user uuid, p_root uuid)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  with recursive tree(id) as (
    select p_root
    union
    select c.id from public.categories c join tree t on c.parent_id = t.id
     where c.user_id = p_user and c.state <> 'deleted'
  )
  select id from tree;
$$;

-- ---------------------------------------------------------------- merges (research R3-05)
-- Moves everything from p_source to p_target and deletes p_source. Sub-categories move under the
-- target; one whose name (ignoring case) already exists there is merged into it, recursively.
create or replace function app._merge_category(p_user uuid, p_source uuid, p_target uuid, p_hlc text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_child record;
  v_same  uuid;
begin
  for v_child in select c.id, c.name from public.categories c
                  where c.user_id = p_user and c.parent_id = p_source and c.state <> 'deleted'
                  order by c.name loop
    select t.id into v_same from public.categories t
     where t.user_id = p_user and t.parent_id = p_target and t.state <> 'deleted'
       and lower(t.name) = lower(v_child.name);
    if found then
      perform app._merge_category(p_user, v_child.id, v_same, p_hlc);
    else
      update public.categories c set parent_id = p_target,
                                     field_versions = app._bump_version(c.field_versions, 'parentId', p_hlc)
       where c.id = v_child.id and c.user_id = p_user;
    end if;
  end loop;

  -- References to the source (R3: payee default categories; R4 adds transactions and split lines).
  update public.payees p set default_category_id = p_target,
                             field_versions = app._bump_version(p.field_versions, 'defaultCategoryId', p_hlc)
   where p.user_id = p_user and p.default_category_id = p_source and p.state <> 'deleted';

  update public.categories c set state = 'deleted', deleted_at = now(), merged_into = p_target,
                                 field_versions = app._bump_version(c.field_versions, 'state', p_hlc)
   where c.id = p_source and c.user_id = p_user;
end;
$$;

-- The target keeps its name, kind and default category; notes are appended (cut at 500 characters,
-- the full text stays in the history); two people's opening balances are added, keeping the earlier
-- date, so the combined balance is exact (FR-024).
create or replace function app._merge_payee(p_user uuid, p_source uuid, p_target uuid, p_hlc text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.payees%rowtype;
  t public.payees%rowtype;
  v_notes text;
  v_versions jsonb;
begin
  select * into s from public.payees p where p.id = p_source and p.user_id = p_user;
  select * into t from public.payees p where p.id = p_target and p.user_id = p_user for update;

  -- References to the source: R4 adds transactions and person-ledger movements here.

  v_versions := t.field_versions;
  v_notes := t.notes;
  if s.notes is not null and s.notes <> '' then
    v_notes := left(case when t.notes is null or t.notes = '' then s.notes else t.notes || E'\n' || s.notes end, 500);
    v_versions := app._bump_version(v_versions, 'notes', p_hlc);
  end if;
  if t.kind = 'person' and s.opening_balance_minor <> 0 then
    v_versions := app._bump_version(v_versions, 'openingBalanceMinor', p_hlc);
  end if;
  if t.kind = 'person' and s.opening_balance_date < t.opening_balance_date then
    v_versions := app._bump_version(v_versions, 'openingBalanceDate', p_hlc);
  end if;

  update public.payees p set
    notes                 = v_notes,
    opening_balance_minor = case when t.kind = 'person' then t.opening_balance_minor + s.opening_balance_minor
                                 else p.opening_balance_minor end,
    opening_balance_date  = case when t.kind = 'person' then least(t.opening_balance_date, s.opening_balance_date)
                                 else p.opening_balance_date end,
    field_versions        = v_versions
   where p.id = p_target and p.user_id = p_user;

  update public.payees p set state = 'deleted', deleted_at = now(), merged_into = p_target,
                             field_versions = app._bump_version(p.field_versions, 'state', p_hlc)
   where p.id = p_source and p.user_id = p_user;
end;
$$;

create or replace function app._merge_tag(p_user uuid, p_source uuid, p_target uuid, p_hlc text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- R4 relabels transactions carrying the source with the target (never twice) here.
  update public.tags t set state = 'deleted', deleted_at = now(), merged_into = p_target,
                           field_versions = app._bump_version(t.field_versions, 'state', p_hlc)
   where t.id = p_source and t.user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------- categories
create or replace function app._apply_category(
  p_user uuid, p_id uuid, p_kind text, p_fields jsonb, p_hlc text, p_options jsonb,
  p_received_at timestamptz, p_change_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_create   constant text[] := array['name', 'kind', 'parentId', 'colour', 'icon', 'hidden'];
  c_update   constant text[] := array['name', 'parentId', 'colour', 'icon', 'hidden'];
  c_required constant text[] := array['name', 'kind', 'colour', 'icon'];
  r          public.categories%rowtype;
  v_exists   boolean;
  v_keys     text[];
  v_merge    jsonb;
  v_applied  text[];
  v_kind     public.category_kind;
  v_parent   uuid;
  v_name     text;
  v_renamed  text;
  v_target   public.categories%rowtype;
begin
  if p_kind not in ('create', 'update', 'delete', 'merge') or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'VALIDATION_FAILED';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_fields) k;
  if (p_kind = 'create' and not (v_keys <@ c_create))
     or (p_kind = 'update' and not (v_keys <@ c_update))
     or (p_kind = 'delete' and cardinality(v_keys) > 0)
     or (p_kind = 'merge' and v_keys <> array['targetId']) then
    raise exception 'VALIDATION_FAILED';
  end if;

  -- Never touch another user's row.
  if exists (select 1 from public.categories c where c.id = p_id and c.user_id <> p_user) then
    raise exception '%', case when p_kind = 'create' then 'VALIDATION_FAILED' else 'NOT_FOUND' end;
  end if;

  select * into r from public.categories c where c.id = p_id and c.user_id = p_user for update;
  v_exists := found;
  if (v_exists and r.state = 'deleted') or (not v_exists and p_kind <> 'create') then
    raise exception 'NOT_FOUND';
  end if;

  v_kind := case when v_exists then r.kind else (p_fields ->> 'kind')::public.category_kind end;

  -- A parent must be one of the caller's live categories of the same kind (FR-001, FR-006).
  if p_fields ? 'parentId' and jsonb_typeof(p_fields -> 'parentId') <> 'null' then
    v_parent := (p_fields ->> 'parentId')::uuid;
    if not exists (select 1 from public.categories c
                    where c.id = v_parent and c.user_id = p_user and c.state <> 'deleted' and c.kind = v_kind) then
      raise exception 'INVALID_MOVE';
    end if;
  end if;

  -- ------------------------------------------------ create
  if p_kind = 'create' and not v_exists then
    if not (c_required <@ v_keys) then
      raise exception 'VALIDATION_FAILED';
    end if;
    if (select count(*) from public.categories c where c.user_id = p_user and c.state <> 'deleted') >= 500 then
      raise exception 'LIMIT_REACHED';
    end if;
    v_name := p_fields ->> 'name';
    if exists (select 1 from public.categories c
                where c.user_id = p_user and c.kind = v_kind and c.parent_id is not distinct from v_parent
                  and lower(c.name) = lower(v_name) and c.state <> 'deleted') then
      if coalesce(p_options ->> 'onNameConflict', 'reject') = 'suffix' then
        v_name := app._free_category_name(p_user, v_kind, v_parent, v_name);
        v_renamed := v_name;
      else
        raise exception 'NAME_TAKEN';
      end if;
    end if;
    v_merge := app.merge_field_versions('{}'::jsonb, c_update || array['state'], p_hlc, p_received_at);
    v_merge := jsonb_set(v_merge, '{applied}', to_jsonb(v_keys));
    perform app._set_change_context(p_change_id, v_merge, v_renamed is not null);
    insert into public.categories (id, user_id, name, kind, parent_id, colour, icon, hidden, field_versions)
    values (p_id, p_user, v_name, v_kind, v_parent, p_fields ->> 'colour', p_fields ->> 'icon',
            coalesce((p_fields ->> 'hidden')::boolean, false), v_merge -> 'fieldVersions');
    return app._change_result(case when v_renamed is null then 'applied' else 'renamed' end, v_merge, v_renamed);
  end if;

  if not v_exists then
    raise exception 'NOT_FOUND';
  end if;

  -- ------------------------------------------------ update (also a create replayed for an existing row)
  if p_kind in ('create', 'update') then
    if p_kind = 'create' then
      -- A replayed create may not change the kind; the rest merges like an update.
      if (p_fields ->> 'kind') is distinct from r.kind::text then
        raise exception 'VALIDATION_FAILED';
      end if;
      v_keys := array(select unnest(v_keys) except select 'kind');
    end if;
    if cardinality(v_keys) = 0 then
      raise exception 'VALIDATION_FAILED';
    end if;
    v_merge := app.merge_field_versions(r.field_versions, v_keys, p_hlc, p_received_at);
    v_applied := array(select jsonb_array_elements_text(v_merge -> 'applied'));
    if cardinality(v_applied) = 0 then
      return app._change_result('applied', v_merge);
    end if;

    v_parent := case when 'parentId' = any(v_applied) then v_parent else r.parent_id end;
    v_name := case when 'name' = any(v_applied) then p_fields ->> 'name' else r.name end;

    -- No cycles: the new parent may not be the category itself or beneath it (FR-006).
    if 'parentId' = any(v_applied) and v_parent is not null
       and v_parent in (select app._category_subtree(p_user, p_id)) then
      raise exception 'INVALID_MOVE';
    end if;
    if ('name' = any(v_applied) or 'parentId' = any(v_applied)) and exists (
         select 1 from public.categories c
          where c.user_id = p_user and c.id <> p_id and c.kind = r.kind and c.parent_id is not distinct from v_parent
            and lower(c.name) = lower(v_name) and c.state <> 'deleted') then
      raise exception 'NAME_TAKEN';
    end if;

    perform app._set_change_context(p_change_id, v_merge, false);
    update public.categories c set
      name           = v_name,
      parent_id      = v_parent,
      colour         = case when 'colour' = any(v_applied) then p_fields ->> 'colour' else c.colour end,
      icon           = case when 'icon' = any(v_applied) then p_fields ->> 'icon' else c.icon end,
      hidden         = case when 'hidden' = any(v_applied) then (p_fields ->> 'hidden')::boolean else c.hidden end,
      field_versions = v_merge -> 'fieldVersions'
    where c.id = p_id and c.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  -- ------------------------------------------------ delete / merge (state field)
  v_merge := app.merge_field_versions(r.field_versions, array['state'], p_hlc, p_received_at);
  if not ('state' = any(array(select jsonb_array_elements_text(v_merge -> 'applied')))) then
    return app._change_result('applied', v_merge);
  end if;

  if p_kind = 'merge' then
    select * into v_target from public.categories c
     where c.id = (p_fields ->> 'targetId')::uuid and c.user_id = p_user and c.state <> 'deleted';
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if v_target.kind <> r.kind or v_target.id in (select app._category_subtree(p_user, p_id)) then
      raise exception 'INVALID_MERGE';
    end if;
    perform app._set_change_context(p_change_id, v_merge, false);
    perform app._merge_category(p_user, p_id, v_target.id, v_merge ->> 'hlc');
    return app._change_result('applied', v_merge);
  end if;

  -- delete (FR-025): only a leaf that nothing has used; payees lose it as their default.
  if exists (select 1 from public.categories c where c.user_id = p_user and c.parent_id = p_id and c.state <> 'deleted') then
    raise exception 'HAS_SUBCATEGORIES';
  end if;
  if app.category_has_activity(p_id) then
    raise exception 'HAS_ACTIVITY';
  end if;
  perform app._set_change_context(p_change_id, v_merge, false);
  update public.payees p set default_category_id = null,
                             field_versions = app._bump_version(p.field_versions, 'defaultCategoryId', v_merge ->> 'hlc')
   where p.user_id = p_user and p.default_category_id = p_id and p.state <> 'deleted';
  update public.categories c set state = 'deleted', deleted_at = now(), field_versions = v_merge -> 'fieldVersions'
   where c.id = p_id and c.user_id = p_user;
  return app._change_result('applied', v_merge);
end;
$$;

-- ---------------------------------------------------------------- tags
create or replace function app._apply_tag(
  p_user uuid, p_id uuid, p_kind text, p_fields jsonb, p_hlc text, p_options jsonb,
  p_received_at timestamptz, p_change_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r         public.tags%rowtype;
  v_exists  boolean;
  v_keys    text[];
  v_merge   jsonb;
  v_name    text;
  v_renamed text;
  v_target  uuid;
begin
  if p_kind not in ('create', 'update', 'delete', 'merge') or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'VALIDATION_FAILED';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_fields) k;
  if (p_kind in ('create', 'update') and v_keys <> array['name'])
     or (p_kind = 'delete' and cardinality(v_keys) > 0)
     or (p_kind = 'merge' and v_keys <> array['targetId']) then
    raise exception 'VALIDATION_FAILED';
  end if;

  if exists (select 1 from public.tags t where t.id = p_id and t.user_id <> p_user) then
    raise exception '%', case when p_kind = 'create' then 'VALIDATION_FAILED' else 'NOT_FOUND' end;
  end if;

  select * into r from public.tags t where t.id = p_id and t.user_id = p_user for update;
  v_exists := found;
  if v_exists and r.state = 'deleted' then
    raise exception 'NOT_FOUND';
  end if;

  if p_kind = 'create' and not v_exists then
    if (select count(*) from public.tags t where t.user_id = p_user and t.state <> 'deleted') >= 500 then
      raise exception 'LIMIT_REACHED';
    end if;
    v_name := p_fields ->> 'name';
    if exists (select 1 from public.tags t
                where t.user_id = p_user and lower(t.name) = lower(v_name) and t.state <> 'deleted') then
      if coalesce(p_options ->> 'onNameConflict', 'reject') = 'suffix' then
        v_name := app._free_tag_name(p_user, v_name);
        v_renamed := v_name;
      else
        raise exception 'NAME_TAKEN';
      end if;
    end if;
    v_merge := app.merge_field_versions('{}'::jsonb, array['name', 'state'], p_hlc, p_received_at);
    v_merge := jsonb_set(v_merge, '{applied}', to_jsonb(v_keys));
    perform app._set_change_context(p_change_id, v_merge, v_renamed is not null);
    insert into public.tags (id, user_id, name, field_versions) values (p_id, p_user, v_name, v_merge -> 'fieldVersions');
    return app._change_result(case when v_renamed is null then 'applied' else 'renamed' end, v_merge, v_renamed);
  end if;

  if not v_exists then
    raise exception 'NOT_FOUND';
  end if;

  if p_kind in ('create', 'update') then
    v_merge := app.merge_field_versions(r.field_versions, v_keys, p_hlc, p_received_at);
    if not ('name' = any(array(select jsonb_array_elements_text(v_merge -> 'applied')))) then
      return app._change_result('applied', v_merge);
    end if;
    v_name := p_fields ->> 'name';
    if exists (select 1 from public.tags t
                where t.user_id = p_user and t.id <> p_id and lower(t.name) = lower(v_name) and t.state <> 'deleted') then
      raise exception 'NAME_TAKEN';
    end if;
    perform app._set_change_context(p_change_id, v_merge, false);
    update public.tags t set name = v_name, field_versions = v_merge -> 'fieldVersions'
     where t.id = p_id and t.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  v_merge := app.merge_field_versions(r.field_versions, array['state'], p_hlc, p_received_at);
  if not ('state' = any(array(select jsonb_array_elements_text(v_merge -> 'applied')))) then
    return app._change_result('applied', v_merge);
  end if;

  if p_kind = 'merge' then
    select t.id into v_target from public.tags t
     where t.id = (p_fields ->> 'targetId')::uuid and t.user_id = p_user and t.state <> 'deleted';
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if v_target = p_id then
      raise exception 'INVALID_MERGE';
    end if;
    perform app._set_change_context(p_change_id, v_merge, false);
    perform app._merge_tag(p_user, p_id, v_target, v_merge ->> 'hlc');
    return app._change_result('applied', v_merge);
  end if;

  -- delete (FR-010): always allowed; R4 also removes the tag from its records here.
  perform app._set_change_context(p_change_id, v_merge, false);
  update public.tags t set state = 'deleted', deleted_at = now(), field_versions = v_merge -> 'fieldVersions'
   where t.id = p_id and t.user_id = p_user;
  return app._change_result('applied', v_merge);
end;
$$;

-- ---------------------------------------------------------------- payees
create or replace function app._apply_payee(
  p_user uuid, p_id uuid, p_kind text, p_fields jsonb, p_hlc text, p_options jsonb,
  p_received_at timestamptz, p_change_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_allowed  constant text[] := array['name', 'kind', 'defaultCategoryId', 'notes', 'hidden', 'openingBalanceMinor',
                                      'openingBalanceDate', 'includeInNetWorth'];
  c_opening  constant text[] := array['openingBalanceMinor', 'openingBalanceDate', 'includeInNetWorth'];
  r          public.payees%rowtype;
  v_exists   boolean;
  v_keys     text[];
  v_merge    jsonb;
  v_applied  text[];
  v_versions jsonb;
  v_name     text;
  v_renamed  text;
  v_kind     public.payee_kind;
  v_category uuid;
  v_opening  bigint;
  v_date     date;
  v_include  boolean;
  v_tz       text;
  v_target   public.payees%rowtype;
  v_field    text;
begin
  if p_kind not in ('create', 'update', 'delete', 'merge') or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'VALIDATION_FAILED';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_fields) k;
  if (p_kind in ('create', 'update') and not (v_keys <@ c_allowed))
     or (p_kind = 'delete' and cardinality(v_keys) > 0)
     or (p_kind = 'merge' and v_keys <> array['targetId']) then
    raise exception 'VALIDATION_FAILED';
  end if;

  if exists (select 1 from public.payees p where p.id = p_id and p.user_id <> p_user) then
    raise exception '%', case when p_kind = 'create' then 'VALIDATION_FAILED' else 'NOT_FOUND' end;
  end if;

  select * into r from public.payees p where p.id = p_id and p.user_id = p_user for update;
  v_exists := found;
  if (v_exists and r.state = 'deleted') or (not v_exists and p_kind <> 'create') then
    raise exception 'NOT_FOUND';
  end if;

  -- A default category must be one of the caller's live categories.
  if p_fields ? 'defaultCategoryId' and jsonb_typeof(p_fields -> 'defaultCategoryId') <> 'null' then
    v_category := (p_fields ->> 'defaultCategoryId')::uuid;
    if not exists (select 1 from public.categories c
                    where c.id = v_category and c.user_id = p_user and c.state <> 'deleted') then
      raise exception 'VALIDATION_FAILED';
    end if;
  end if;

  select p.timezone into v_tz from public.user_preferences p where p.user_id = p_user;
  if p_fields ? 'openingBalanceDate' and jsonb_typeof(p_fields -> 'openingBalanceDate') <> 'null'
     and (p_fields ->> 'openingBalanceDate')::date > (p_received_at at time zone coalesce(v_tz, 'Asia/Kolkata'))::date then
    raise exception 'DATE_IN_FUTURE';
  end if;

  -- ------------------------------------------------ create
  if p_kind = 'create' and not v_exists then
    if not (array['name', 'kind'] <@ v_keys) then
      raise exception 'VALIDATION_FAILED';
    end if;
    if (select count(*) from public.payees p where p.user_id = p_user and p.state <> 'deleted') >= 2000 then
      raise exception 'LIMIT_REACHED';
    end if;
    v_name := p_fields ->> 'name';
    if exists (select 1 from public.payees p
                where p.user_id = p_user and lower(p.name) = lower(v_name) and p.state <> 'deleted') then
      if coalesce(p_options ->> 'onNameConflict', 'reject') = 'suffix' then
        v_name := app._free_payee_name(p_user, v_name);
        v_renamed := v_name;
      else
        raise exception 'NAME_TAKEN';
      end if;
    end if;
    v_merge := app.merge_field_versions('{}'::jsonb, c_allowed || array['state'], p_hlc, p_received_at);
    v_merge := jsonb_set(v_merge, '{applied}', to_jsonb(v_keys));
    perform app._set_change_context(p_change_id, v_merge, v_renamed is not null);
    -- The table's checks keep businesses neutral and people dated (VALIDATION_FAILED otherwise).
    insert into public.payees (id, user_id, name, kind, default_category_id, notes, hidden, opening_balance_minor,
                               opening_balance_date, include_in_net_worth, field_versions)
    values (p_id, p_user, v_name, (p_fields ->> 'kind')::public.payee_kind, v_category, p_fields ->> 'notes',
            coalesce((p_fields ->> 'hidden')::boolean, false), coalesce((p_fields ->> 'openingBalanceMinor')::bigint, 0),
            (p_fields ->> 'openingBalanceDate')::date, coalesce((p_fields ->> 'includeInNetWorth')::boolean, false),
            v_merge -> 'fieldVersions');
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
         select 1 from public.payees p
          where p.user_id = p_user and p.id <> p_id and lower(p.name) = lower(v_name) and p.state <> 'deleted') then
      raise exception 'NAME_TAKEN';
    end if;

    v_kind    := case when 'kind' = any(v_applied) then (p_fields ->> 'kind')::public.payee_kind else r.kind end;
    v_opening := case when 'openingBalanceMinor' = any(v_applied)
                      then (p_fields ->> 'openingBalanceMinor')::bigint else r.opening_balance_minor end;
    v_date    := case when 'openingBalanceDate' = any(v_applied)
                      then (p_fields ->> 'openingBalanceDate')::date else r.opening_balance_date end;
    v_include := case when 'includeInNetWorth' = any(v_applied)
                      then (p_fields ->> 'includeInNetWorth')::boolean else r.include_in_net_worth end;

    -- A person becomes a business only when settled (FR-014); the opening fields are cleared.
    if r.kind = 'person' and v_kind = 'business' then
      if app.person_balance_minor(p_id) - r.opening_balance_minor + v_opening <> 0 then
        raise exception 'BALANCE_NOT_ZERO';
      end if;
      v_opening := 0;
      v_date := null;
      v_include := false;
      foreach v_field in array c_opening loop
        v_versions := app._bump_version(v_versions, v_field, v_merge ->> 'hlc');
      end loop;
    end if;

    perform app._set_change_context(p_change_id, v_merge, false);
    update public.payees p set
      name                  = v_name,
      kind                  = v_kind,
      default_category_id   = case when 'defaultCategoryId' = any(v_applied) then v_category else p.default_category_id end,
      notes                 = case when 'notes' = any(v_applied) then p_fields ->> 'notes' else p.notes end,
      hidden                = case when 'hidden' = any(v_applied) then (p_fields ->> 'hidden')::boolean else p.hidden end,
      opening_balance_minor = v_opening,
      opening_balance_date  = v_date,
      include_in_net_worth  = v_include,
      field_versions        = v_versions
    where p.id = p_id and p.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  -- ------------------------------------------------ delete / merge (state field)
  v_merge := app.merge_field_versions(r.field_versions, array['state'], p_hlc, p_received_at);
  if not ('state' = any(array(select jsonb_array_elements_text(v_merge -> 'applied')))) then
    return app._change_result('applied', v_merge);
  end if;

  if p_kind = 'merge' then
    select * into v_target from public.payees p
     where p.id = (p_fields ->> 'targetId')::uuid and p.user_id = p_user and p.state <> 'deleted';
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if v_target.id = p_id or v_target.kind <> r.kind then
      raise exception 'INVALID_MERGE';
    end if;
    perform app._set_change_context(p_change_id, v_merge, false);
    perform app._merge_payee(p_user, p_id, v_target.id, v_merge ->> 'hlc');
    return app._change_result('applied', v_merge);
  end if;

  -- delete (FR-025): only a payee nothing has used.
  if app.payee_has_activity(p_id) then
    raise exception 'HAS_ACTIVITY';
  end if;
  perform app._set_change_context(p_change_id, v_merge, false);
  update public.payees p set state = 'deleted', deleted_at = now(), field_versions = v_merge -> 'fieldVersions'
   where p.id = p_id and p.user_id = p_user;
  return app._change_result('applied', v_merge);
end;
$$;

-- ---------------------------------------------------------------- one change, exactly once (R2-03)
-- As 20261024000006_apply_changes.sql, dispatching the R3 entities and mapping their codes.
create or replace function app._apply_one(p_user uuid, p_change jsonb, p_received_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_codes      constant text[] := array['VALIDATION_FAILED', 'NAME_TAKEN', 'GROUP_NAME_TAKEN', 'BALANCE_NOT_ZERO',
                                        'HAS_ACTIVITY', 'LIMIT_REACHED', 'DATE_IN_FUTURE', 'NOT_FOUND',
                                        'HAS_SUBCATEGORIES', 'INVALID_MOVE', 'INVALID_MERGE'];
  v_change_id  uuid;
  v_stored     jsonb;
  v_result     jsonb;
  v_constraint text;
  v_entity_id  uuid;
  v_fields     jsonb;
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
    v_entity_id := (p_change ->> 'entityId')::uuid;
    v_fields := coalesce(p_change -> 'fields', '{}'::jsonb);
    v_result := case p_change ->> 'entity'
      when 'account' then app._apply_account(p_user, v_entity_id, p_change ->> 'kind', v_fields, p_change ->> 'hlc',
                                             p_change -> 'options', p_received_at, v_change_id)
      when 'account_group' then app._apply_group(p_user, v_entity_id, p_change ->> 'kind', v_fields, p_change ->> 'hlc',
                                                 p_change -> 'options', p_received_at, v_change_id)
      when 'category' then app._apply_category(p_user, v_entity_id, p_change ->> 'kind', v_fields, p_change ->> 'hlc',
                                               p_change -> 'options', p_received_at, v_change_id)
      when 'tag' then app._apply_tag(p_user, v_entity_id, p_change ->> 'kind', v_fields, p_change ->> 'hlc',
                                     p_change -> 'options', p_received_at, v_change_id)
      when 'payee' then app._apply_payee(p_user, v_entity_id, p_change ->> 'kind', v_fields, p_change ->> 'hlc',
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
                         when v_constraint in ('accounts_name_unique', 'categories_name_unique', 'tags_name_unique',
                                               'payees_name_unique') then 'NAME_TAKEN'
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

revoke execute on function app._bump_version(jsonb, text, text) from public, anon, authenticated;
revoke execute on function app._free_category_name(uuid, public.category_kind, uuid, text) from public, anon, authenticated;
revoke execute on function app._free_tag_name(uuid, text) from public, anon, authenticated;
revoke execute on function app._free_payee_name(uuid, text) from public, anon, authenticated;
revoke execute on function app._category_subtree(uuid, uuid) from public, anon, authenticated;
revoke execute on function app._merge_category(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function app._merge_payee(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function app._merge_tag(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function app._apply_category(uuid, uuid, text, jsonb, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function app._apply_tag(uuid, uuid, text, jsonb, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function app._apply_payee(uuid, uuid, text, jsonb, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function app._apply_one(uuid, jsonb, timestamptz) from public, anon, authenticated;
