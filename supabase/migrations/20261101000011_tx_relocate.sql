-- T048 Relocate (R4 FR-019, research R4-06) and R3's merges and tag delete reaching transactions.
--
-- REVIEW (constitution workflow — RLS, sync): every function is SECURITY DEFINER and touches only
-- rows with user_id = p_user (= auth.uid() through app.apply_changes). Moved rows get their field
-- versions bumped (categoryId / payeeId / tagIds; split lines share amountMinor, R4-01), so devices
-- pull the change. The postings trigger keeps balances and totals in step.

-- The HLC of the change being applied, or the server clock.
create or replace function app._ctx_hlc()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('app.change_context', true), '')::jsonb ->> 'hlc',
                  lpad(floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text, 13, '0') || '.0000.server00');
$$;

-- Every transaction and split line using p_source now uses p_target. Returns how many rows changed.
create or replace function app._repoint_category(p_user uuid, p_source uuid, p_target uuid, p_hlc text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a integer;
  v_b integer;
begin
  update public.transactions t set category_id = p_target,
         field_versions = app._bump_version(t.field_versions, 'categoryId', p_hlc)
   where t.user_id = p_user and t.category_id = p_source;
  get diagnostics v_a = row_count;
  update public.transactions t set
         lines = (select jsonb_agg(case when e.l ->> 'categoryId' = p_source::text
                                        then jsonb_set(e.l, '{categoryId}', to_jsonb(p_target::text)) else e.l end order by e.n)
                    from jsonb_array_elements(t.lines) with ordinality e(l, n)),
         field_versions = app._bump_version(t.field_versions, 'amountMinor', p_hlc)
   where t.user_id = p_user
     and exists (select 1 from jsonb_array_elements(t.lines) l where l ->> 'categoryId' = p_source::text);
  get diagnostics v_b = row_count;
  return v_a + v_b;
end;
$$;

-- As above for payees (the payee, and person shares in lines). A person target must not end up with
-- a movement before its opening date. An interest proposal for a month the target already has stays
-- with the source (withdrawn when merging: the source is going away).
create or replace function app._repoint_payee(p_user uuid, p_source uuid, p_target uuid, p_hlc text, p_merging boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a integer;
  v_b integer;
begin
  if exists (
       select 1 from public.payees p
        where p.id = p_target and p.user_id = p_user and p.kind = 'person' and p.opening_balance_date is not null
          and exists (select 1 from public.transactions t
                       where t.user_id = p_user and t.state = 'active' and t.date < p.opening_balance_date
                         and (t.payee_id = p_source
                              or exists (select 1 from jsonb_array_elements(t.lines) l where l ->> 'personId' = p_source::text)))) then
    raise exception 'DATE_BEFORE_OPENING';
  end if;
  if p_merging then
    update public.transactions t set state = 'deleted', deleted_at = now(),
           field_versions = app._bump_version(t.field_versions, 'state', p_hlc)
     where t.user_id = p_user and t.payee_id = p_source and t.generated and t.state = 'active'
       and exists (select 1 from public.transactions x
                    where x.user_id = p_user and x.payee_id = p_target and x.generated and x.interest_month = t.interest_month);
  end if;
  update public.transactions t set payee_id = p_target,
         field_versions = app._bump_version(t.field_versions, 'payeeId', p_hlc)
   where t.user_id = p_user and t.payee_id = p_source
     and not (t.generated and exists (select 1 from public.transactions x
                                       where x.user_id = p_user and x.payee_id = p_target and x.generated
                                         and x.interest_month = t.interest_month));
  get diagnostics v_a = row_count;
  update public.transactions t set
         lines = (select jsonb_agg(case when e.l ->> 'personId' = p_source::text
                                        then jsonb_set(e.l, '{personId}', to_jsonb(p_target::text)) else e.l end order by e.n)
                    from jsonb_array_elements(t.lines) with ordinality e(l, n)),
         field_versions = app._bump_version(t.field_versions, 'amountMinor', p_hlc)
   where t.user_id = p_user
     and exists (select 1 from jsonb_array_elements(t.lines) l where l ->> 'personId' = p_source::text);
  get diagnostics v_b = row_count;
  return v_a + v_b;
end;
$$;

-- Tags: replaced by p_target (never twice), or removed when p_target is null (a deleted tag, FR-021).
create or replace function app._repoint_tag(p_user uuid, p_source uuid, p_target uuid, p_hlc text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a integer;
  v_b integer;
begin
  update public.transactions t set
         tag_ids = case when p_target is null or p_target = any(t.tag_ids) then array_remove(t.tag_ids, p_source)
                        else array_replace(t.tag_ids, p_source, p_target) end,
         field_versions = app._bump_version(t.field_versions, 'tagIds', p_hlc)
   where t.user_id = p_user and p_source = any(t.tag_ids);
  get diagnostics v_a = row_count;
  update public.transactions t set
         lines = (select jsonb_agg(case when e.l -> 'tagIds' ? p_source::text then
                    jsonb_set(e.l, '{tagIds}', (
                      select coalesce(jsonb_agg(distinct s.v), '[]'::jsonb)
                        from (select case when x = p_source::text then p_target::text else x end as v
                                from jsonb_array_elements_text(e.l -> 'tagIds') x) s
                       where s.v is not null))
                    else e.l end order by e.n)
                    from jsonb_array_elements(t.lines) with ordinality e(l, n)),
         field_versions = app._bump_version(t.field_versions, 'amountMinor', p_hlc)
   where t.user_id = p_user
     and exists (select 1 from jsonb_array_elements(t.lines) l where l -> 'tagIds' ? p_source::text);
  get diagnostics v_b = row_count;
  return v_a + v_b;
end;
$$;

-- R3 merges set merged_into and delete the source; R3 tag delete just deletes. Either way the
-- transactions follow here (R3 review note; FR-019, FR-021).
create or replace function app._list_row_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state = 'deleted' and old.state <> 'deleted' then
    if tg_table_name = 'categories' and new.merged_into is not null then
      perform app._repoint_category(new.user_id, new.id, new.merged_into, app._ctx_hlc());
    elsif tg_table_name = 'payees' and new.merged_into is not null then
      perform app._repoint_payee(new.user_id, new.id, new.merged_into, app._ctx_hlc(), true);
    elsif tg_table_name = 'tags' then
      perform app._repoint_tag(new.user_id, new.id, new.merged_into, app._ctx_hlc());
    end if;
  end if;
  return null;
end;
$$;

create trigger categories_follow_transactions after update of state on public.categories
  for each row execute function app._list_row_deleted();
create trigger payees_follow_transactions after update of state on public.payees
  for each row execute function app._list_row_deleted();
create trigger tags_follow_transactions after update of state on public.tags
  for each row execute function app._list_row_deleted();

-- relocate { targetId }: everything from the change's category or payee moves to the target; the
-- source stays (FR-019). Same kind only; the history names the target and how many moved.
create or replace function app._relocate(p_user uuid, p_entity text, p_id uuid, p_fields jsonb, p_hlc text, p_change_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_skind  text;
  v_tkind  text;
  v_moved  integer;
  v_device text := nullif(current_setting('app.device_type', true), '');
begin
  if jsonb_typeof(p_fields) <> 'object' or (select array_agg(k) from jsonb_object_keys(p_fields) k) <> array['targetId'] then
    raise exception 'VALIDATION_FAILED';
  end if;
  v_target := (p_fields ->> 'targetId')::uuid;
  if p_entity = 'category' then
    select c.kind::text into v_skind from public.categories c where c.id = p_id and c.user_id = p_user and c.state <> 'deleted';
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    select c.kind::text into v_tkind from public.categories c where c.id = v_target and c.user_id = p_user and c.state <> 'deleted';
  else
    select p.kind::text into v_skind from public.payees p where p.id = p_id and p.user_id = p_user and p.state <> 'deleted';
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    select p.kind::text into v_tkind from public.payees p where p.id = v_target and p.user_id = p_user and p.state <> 'deleted';
  end if;
  if v_tkind is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_target = p_id or v_skind <> v_tkind then
    raise exception 'INVALID_MERGE';
  end if;

  perform app._set_change_context(p_change_id, jsonb_build_object('hlc', p_hlc), false);
  v_moved := case when p_entity = 'category' then app._repoint_category(p_user, p_id, v_target, p_hlc)
                  else app._repoint_payee(p_user, p_id, v_target, p_hlc, false) end;
  perform app.write_audit((p_entity || '_relocated')::public.audit_action, auth.uid(), null, p_entity, p_id, null,
                          case when v_device in ('web', 'android') then v_device end,
                          jsonb_build_object('ownerId', p_user, 'targetId', v_target, 'moved', v_moved));
  return jsonb_build_object('status', 'applied');
end;
$$;

revoke execute on function app._ctx_hlc() from public, anon, authenticated;
revoke execute on function app._repoint_category(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function app._repoint_payee(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function app._repoint_tag(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function app._list_row_deleted() from public, anon, authenticated;
revoke execute on function app._relocate(uuid, text, uuid, jsonb, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- one change, exactly once
-- As 20261101000005_tx_apply.sql, routing relocate for categories and payees.
create or replace function app._apply_one(p_user uuid, p_change jsonb, p_received_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_codes      constant text[] := array['VALIDATION_FAILED', 'NAME_TAKEN', 'GROUP_NAME_TAKEN', 'BALANCE_NOT_ZERO',
                                        'HAS_ACTIVITY', 'LIMIT_REACHED', 'DATE_IN_FUTURE', 'NOT_FOUND',
                                        'HAS_SUBCATEGORIES', 'INVALID_MOVE', 'INVALID_MERGE', 'DATE_BEFORE_OPENING',
                                        'LINES_MISMATCH', 'ACCOUNT_INACTIVE', 'INVALID_PERSON', 'INVALID_CATEGORY'];
  v_change_id  uuid;
  v_stored     jsonb;
  v_result     jsonb;
  v_constraint text;
  v_entity_id  uuid;
  v_fields     jsonb;
  v_kind       text := p_change ->> 'kind';
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

  begin
    v_entity_id := (p_change ->> 'entityId')::uuid;
    v_fields := coalesce(p_change -> 'fields', '{}'::jsonb);
    v_result := case p_change ->> 'entity'
      when 'account' then app._apply_account(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id)
      when 'account_group' then app._apply_group(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id)
      when 'category' then case when v_kind = 'relocate'
                                then app._relocate(p_user, 'category', v_entity_id, v_fields, p_change ->> 'hlc', v_change_id)
                                else app._apply_category(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id) end
      when 'tag' then app._apply_tag(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id)
      when 'payee' then case when v_kind = 'relocate'
                             then app._relocate(p_user, 'payee', v_entity_id, v_fields, p_change ->> 'hlc', v_change_id)
                             else app._apply_payee(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id) end
      when 'transaction' then app._apply_transaction(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id)
      when 'person_rate' then app._apply_person_rate(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id)
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
