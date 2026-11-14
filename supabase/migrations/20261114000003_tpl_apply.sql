-- T009 Writes for quick-add templates through the single write path
-- (specs/008-quick-add-templates/contracts/sync-protocol.md; research R8-01, R8-04, R8-08).
--
-- REVIEW (constitution workflow — RLS / sync / money): runs inside app.apply_changes (SECURITY
-- DEFINER). Every row read or written has user_id = p_user (= auth.uid()); every referenced account,
-- payee, person, category, tag and planned payment must be the caller's own (composite foreign keys
-- enforce most of it too). Amount and split lines share one field version, as R4's transactions.

-- ---------------------------------------------------------------- validation (as R4's _validate_transaction)
-- p_check_active: the account(s) must be active (a new template, or one moved to another account).
-- p_tie_changed: the tied planned payment was set or changed, so it must be live and fit (R8-04).
create or replace function app._validate_template(p_user uuid, t public.transaction_templates, p_check_active boolean, p_tie_changed boolean)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account record;
  v_line    jsonb;
  v_count   integer := jsonb_array_length(t.lines);
  v_sum     bigint := 0;
  v_amount  bigint;
  v_kind    public.category_kind := case when t.kind = 'income' then 'income' else 'expense' end::public.category_kind;
  v_share   text := case when t.flow = 'out' then 'paid_on_behalf' else 'collected_on_behalf' end;
  v_tag     text;
  v_item    public.plan_items%rowtype;
begin
  if t.flow is null or t.flow <> app._flow_of(t.kind, t.person_action, t.flow) then
    raise exception 'INVALID_TEMPLATE';
  end if;

  for v_account in select a.* from public.accounts a where a.user_id = p_user and a.id in (t.account_id, t.to_account_id) loop
    if v_account.state = 'deleted' or (p_check_active and v_account.state <> 'active') then
      raise exception 'INVALID_TEMPLATE';
    end if;
  end loop;
  if not exists (select 1 from public.accounts a where a.id = t.account_id and a.user_id = p_user)
     or (t.to_account_id is not null and not exists (select 1 from public.accounts a where a.id = t.to_account_id and a.user_id = p_user)) then
    raise exception 'INVALID_TEMPLATE';
  end if;

  if t.payee_id is not null and not exists (
       select 1 from public.payees p where p.id = t.payee_id and p.user_id = p_user and p.state <> 'deleted'
          and (t.kind <> 'person' or p.kind = 'person')) then
    raise exception 'INVALID_TEMPLATE';
  end if;

  if t.category_id is not null and (
       t.kind not in ('expense', 'income', 'refund') or v_count > 0
       or not exists (select 1 from public.categories c where c.id = t.category_id and c.user_id = p_user
                        and c.state <> 'deleted' and c.kind = v_kind)) then
    raise exception 'INVALID_TEMPLATE';
  end if;

  -- Split lines (R4 FR-012), adding up to the amount (FR-002).
  if v_count > 0 then
    if t.kind not in ('expense', 'income', 'refund') or v_count < 2 or v_count > 50 or t.amount_minor is null then
      raise exception 'INVALID_TEMPLATE';
    end if;
    for v_line in select e.value from jsonb_array_elements(t.lines) e loop
      if jsonb_typeof(v_line) <> 'object' or coalesce(v_line ->> 'amountMinor', '') !~ '^\d{1,12}$' then
        raise exception 'INVALID_TEMPLATE';
      end if;
      v_amount := (v_line ->> 'amountMinor')::bigint;
      if v_amount < 1 or char_length(coalesce(v_line ->> 'notes', '')) > 500 then
        raise exception 'INVALID_TEMPLATE';
      end if;
      v_sum := v_sum + v_amount;
      if v_line ->> 'personId' is not null then
        if v_line ->> 'categoryId' is not null or v_line ->> 'personAction' is distinct from v_share
           or not exists (select 1 from public.payees p where p.id = (v_line ->> 'personId')::uuid and p.user_id = p_user
                            and p.state <> 'deleted' and p.kind = 'person') then
          raise exception 'INVALID_TEMPLATE';
        end if;
      elsif v_line ->> 'categoryId' is not null
            and not exists (select 1 from public.categories c where c.id = (v_line ->> 'categoryId')::uuid and c.user_id = p_user
                              and c.state <> 'deleted' and c.kind = v_kind) then
        raise exception 'INVALID_TEMPLATE';
      end if;
      for v_tag in select jsonb_array_elements_text(coalesce(v_line -> 'tagIds', '[]'::jsonb)) loop
        if not exists (select 1 from public.tags g where g.id = v_tag::uuid and g.user_id = p_user and g.state <> 'deleted') then
          raise exception 'INVALID_TEMPLATE';
        end if;
      end loop;
    end loop;
    if v_sum <> t.amount_minor then
      raise exception 'INVALID_TEMPLATE';
    end if;
  end if;

  if cardinality(t.tag_ids) > 20 or exists (
       select 1 from unnest(t.tag_ids) g
        where not exists (select 1 from public.tags x where x.id = g and x.user_id = p_user and x.state <> 'deleted')) then
    raise exception 'INVALID_TEMPLATE';
  end if;

  -- The tied planned payment: the caller's live item, paid the way the template pays (R7's rule).
  if t.plan_item_id is not null and p_tie_changed then
    select * into v_item from public.plan_items i where i.id = t.plan_item_id and i.user_id = p_user and i.state = 'active';
    if not found or not (case v_item.target
         when 'payee' then t.kind = 'expense' and t.payee_id is not distinct from v_item.payee_id and t.payee_id is not null
         when 'card' then t.kind = 'transfer' and t.to_account_id = v_item.card_account_id
         when 'person' then t.kind = 'person' and t.payee_id = v_item.payee_id and t.person_action in ('lent', 'repaid_to', 'paid_on_behalf')
         else false end) then
      raise exception 'INVALID_TEMPLATE';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------- templates
create or replace function app._apply_template(
  p_user uuid, p_id uuid, p_kind text, p_fields jsonb, p_hlc text, p_options jsonb,
  p_received_at timestamptz, p_change_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_fields   constant text[] := array['name', 'kind', 'accountId', 'toAccountId', 'amountMinor', 'payeeId', 'personAction',
                                      'flow', 'categoryId', 'lines', 'tagIds', 'notes', 'planItemId', 'sortKey', 'hidden'];
  -- The split lines share the amount's version (R4-01); kind never changes.
  c_versions constant text[] := array['name', 'accountId', 'toAccountId', 'amountMinor', 'payeeId', 'personAction', 'flow',
                                      'categoryId', 'tagIds', 'notes', 'planItemId', 'sortKey', 'hidden', 'state'];
  r         public.transaction_templates%rowtype;
  t         public.transaction_templates%rowtype;
  v_exists  boolean;
  v_keys    text[];
  v_vkeys   text[];
  v_merge   jsonb;
  v_applied text[];
begin
  if p_kind not in ('create', 'update', 'delete') or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'VALIDATION_FAILED';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_fields) k;
  if not (v_keys <@ c_fields) or (p_kind = 'update' and 'kind' = any(v_keys)) or (p_kind = 'delete' and cardinality(v_keys) > 0) then
    raise exception 'VALIDATION_FAILED';
  end if;
  if p_kind = 'update' and (('amountMinor' = any(v_keys)) <> ('lines' = any(v_keys))) then
    raise exception 'VALIDATION_FAILED';
  end if;
  v_vkeys := array(select k from unnest(v_keys) k where k not in ('kind', 'lines'));

  if exists (select 1 from public.transaction_templates x where x.id = p_id and x.user_id <> p_user) then
    raise exception '%', case when p_kind = 'create' then 'VALIDATION_FAILED' else 'NOT_FOUND' end;
  end if;
  select * into r from public.transaction_templates x where x.id = p_id and x.user_id = p_user for update;
  v_exists := found;
  if (v_exists and r.state = 'deleted') or (not v_exists and p_kind <> 'create') then
    raise exception 'NOT_FOUND';
  end if;

  -- ------------------------------------------------ create
  if p_kind = 'create' and not v_exists then
    if not (array['name', 'kind', 'accountId', 'sortKey'] <@ v_keys) then
      raise exception 'VALIDATION_FAILED';
    end if;
    if (select count(*) from public.transaction_templates x where x.user_id = p_user and x.state <> 'deleted') >= 100 then
      raise exception 'LIMIT_REACHED';
    end if;
    t.id := p_id;
    t.user_id := p_user;
    t.name := p_fields ->> 'name';
    t.kind := (p_fields ->> 'kind')::public.transaction_kind;
    t.account_id := (p_fields ->> 'accountId')::uuid;
    t.to_account_id := (p_fields ->> 'toAccountId')::uuid;
    t.amount_minor := (p_fields ->> 'amountMinor')::bigint;
    t.payee_id := (p_fields ->> 'payeeId')::uuid;
    t.person_action := (p_fields ->> 'personAction')::public.person_action;
    t.flow := app._flow_of(t.kind, t.person_action, (p_fields ->> 'flow')::public.money_flow);
    t.category_id := (p_fields ->> 'categoryId')::uuid;
    t.lines := coalesce(p_fields -> 'lines', '[]'::jsonb);
    t.tag_ids := app._uuid_array(p_fields -> 'tagIds');
    t.notes := p_fields ->> 'notes';
    t.plan_item_id := (p_fields ->> 'planItemId')::uuid;
    t.sort_key := p_fields ->> 'sortKey';
    t.hidden := coalesce((p_fields ->> 'hidden')::boolean, false);
    if t.kind = 'interest' or t.person_action = 'adjustment' then
      raise exception 'INVALID_TEMPLATE';
    end if;
    perform app._validate_template(p_user, t, true, true);

    v_merge := app.merge_field_versions('{}'::jsonb, c_versions, p_hlc, p_received_at);
    v_merge := jsonb_set(v_merge, '{applied}', to_jsonb(v_keys));
    perform app._set_change_context(p_change_id, v_merge, false);
    insert into public.transaction_templates (id, user_id, name, kind, flow, account_id, to_account_id, amount_minor, payee_id,
                                              person_action, category_id, lines, tag_ids, notes, plan_item_id, sort_key, hidden,
                                              field_versions)
    values (t.id, t.user_id, t.name, t.kind, t.flow, t.account_id, t.to_account_id, t.amount_minor, t.payee_id,
            t.person_action, t.category_id, t.lines, t.tag_ids, t.notes, t.plan_item_id, t.sort_key, t.hidden,
            v_merge -> 'fieldVersions');
    return app._change_result('applied', v_merge);
  end if;

  -- ------------------------------------------------ update (also a create replayed for an existing row)
  if p_kind in ('create', 'update') then
    if p_kind = 'create' and (p_fields ->> 'kind') is distinct from r.kind::text then
      raise exception 'VALIDATION_FAILED';
    end if;
    if cardinality(v_vkeys) = 0 then
      raise exception 'VALIDATION_FAILED';
    end if;
    v_merge := app.merge_field_versions(r.field_versions, v_vkeys, p_hlc, p_received_at);
    v_applied := array(select jsonb_array_elements_text(v_merge -> 'applied'));
    if cardinality(v_applied) = 0 then
      return app._change_result('applied', v_merge);
    end if;

    t := r;
    if 'name' = any(v_applied) then t.name := p_fields ->> 'name'; end if;
    if 'accountId' = any(v_applied) then t.account_id := (p_fields ->> 'accountId')::uuid; end if;
    if 'toAccountId' = any(v_applied) then t.to_account_id := (p_fields ->> 'toAccountId')::uuid; end if;
    if 'amountMinor' = any(v_applied) then
      t.amount_minor := (p_fields ->> 'amountMinor')::bigint;
      t.lines := coalesce(p_fields -> 'lines', '[]'::jsonb);
    end if;
    if 'payeeId' = any(v_applied) then t.payee_id := (p_fields ->> 'payeeId')::uuid; end if;
    if 'personAction' = any(v_applied) then t.person_action := (p_fields ->> 'personAction')::public.person_action; end if;
    if 'flow' = any(v_applied) then t.flow := (p_fields ->> 'flow')::public.money_flow; end if;
    t.flow := app._flow_of(t.kind, t.person_action, t.flow);
    if 'categoryId' = any(v_applied) then t.category_id := (p_fields ->> 'categoryId')::uuid; end if;
    if 'tagIds' = any(v_applied) then t.tag_ids := app._uuid_array(p_fields -> 'tagIds'); end if;
    if 'notes' = any(v_applied) then t.notes := p_fields ->> 'notes'; end if;
    if 'planItemId' = any(v_applied) then t.plan_item_id := (p_fields ->> 'planItemId')::uuid; end if;
    if 'sortKey' = any(v_applied) then t.sort_key := p_fields ->> 'sortKey'; end if;
    if 'hidden' = any(v_applied) then t.hidden := (p_fields ->> 'hidden')::boolean; end if;
    if t.person_action = 'adjustment' then
      raise exception 'INVALID_TEMPLATE';
    end if;

    perform app._validate_template(p_user, t,
      t.account_id is distinct from r.account_id or t.to_account_id is distinct from r.to_account_id,
      t.plan_item_id is distinct from r.plan_item_id);
    perform app._set_change_context(p_change_id, v_merge, false);
    update public.transaction_templates x set
      name = t.name, flow = t.flow, account_id = t.account_id, to_account_id = t.to_account_id, amount_minor = t.amount_minor,
      payee_id = t.payee_id, person_action = t.person_action, category_id = t.category_id, lines = t.lines, tag_ids = t.tag_ids,
      notes = t.notes, plan_item_id = t.plan_item_id, sort_key = t.sort_key, hidden = t.hidden,
      field_versions = v_merge -> 'fieldVersions'
    where x.id = p_id and x.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  -- ------------------------------------------------ delete (soft; recordings are untouched, FR-006)
  v_merge := app.merge_field_versions(r.field_versions, array['state'], p_hlc, p_received_at);
  if not ('state' = any(array(select jsonb_array_elements_text(v_merge -> 'applied')))) then
    return app._change_result('applied', v_merge);
  end if;
  perform app._set_change_context(p_change_id, v_merge, false);
  update public.transaction_templates x set state = 'deleted', deleted_at = now(), field_versions = v_merge -> 'fieldVersions'
   where x.id = p_id and x.user_id = p_user;
  return app._change_result('applied', v_merge);
end;
$$;

-- ---------------------------------------------------------------- one change, exactly once
-- As 20261113000004_plan_apply.sql, dispatching templates and mapping their codes.
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
                                        'LINES_MISMATCH', 'ACCOUNT_INACTIVE', 'INVALID_PERSON', 'INVALID_CATEGORY',
                                        'INVALID_PLAN_ITEM', 'TERMS_IN_PAST', 'HAS_PAYMENTS', 'INVALID_OCCURRENCE',
                                        'INVALID_PLAN_LINK', 'INVALID_TEMPLATE'];
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
      when 'plan_item' then app._apply_plan_item(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id)
      when 'plan_occurrence' then app._apply_plan_occurrence(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id)
      when 'template' then app._apply_template(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id)
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
                                               'payees_name_unique', 'transaction_templates_name_unique') then 'NAME_TAKEN'
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

revoke execute on function app._validate_template(uuid, public.transaction_templates, boolean, boolean) from public, anon, authenticated;
revoke execute on function app._apply_template(uuid, uuid, text, jsonb, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function app._apply_one(uuid, jsonb, timestamptz) from public, anon, authenticated;
