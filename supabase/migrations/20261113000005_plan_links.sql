-- T012 Payment links on transactions (research R7-03) and merges reaching plan items (R7-12).
--
-- REVIEW (constitution workflow — RLS / sync / money): `_apply_transaction` is replaced (as
-- 20261101000005_tx_apply.sql) only to accept, check and store `planItemId` / `planMonth`, which share
-- one field version `plan`. A link names the caller's own live item and a month the item has
-- (composite foreign key too); only money-out kinds can pay a plan item. A transaction pays at most
-- one item-month by construction. Deleting or voiding a linked transaction keeps the link fields; the
-- plan stops counting it (R7-03). The repoint functions also move plan items' payee and category,
-- bumping their field versions so devices pull the change.

-- ---------------------------------------------------------------- link rules
-- p_new: the link is being set or moved now (the item must be live and have the month); otherwise only
-- the transaction's kind is checked (a kept link survives the item's later deletion, FR-008).
create or replace function app._validate_plan_link(p_user uuid, t public.transactions, p_new boolean)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item public.plan_items%rowtype;
begin
  if t.plan_item_id is null and t.plan_month is null then
    return;
  end if;
  if t.plan_item_id is null or t.plan_month is null
     or not (t.kind in ('expense', 'transfer')
             or (t.kind = 'person' and t.person_action in ('lent', 'repaid_to', 'paid_on_behalf'))) then
    raise exception 'INVALID_PLAN_LINK';
  end if;
  if p_new then
    select * into v_item from public.plan_items i where i.id = t.plan_item_id and i.user_id = p_user and i.state = 'active';
    if not found or extract(day from t.plan_month) <> 1
       or not app._plan_applies(v_item.start_month, v_item.end_month, v_item.interval_months, t.plan_month) then
      raise exception 'INVALID_PLAN_LINK';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------- transactions
create or replace function app._apply_transaction(
  p_user uuid, p_id uuid, p_kind text, p_fields jsonb, p_hlc text, p_options jsonb,
  p_received_at timestamptz, p_change_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_fields   constant text[] := array['date', 'timeOfDay', 'kind', 'accountId', 'toAccountId', 'amountMinor', 'payeeId',
                                      'personAction', 'flow', 'categoryId', 'lines', 'tagIds', 'notes', 'reference',
                                      'status', 'confirmed', 'planItemId', 'planMonth'];
  c_versions constant text[] := array['date', 'timeOfDay', 'accountId', 'toAccountId', 'amountMinor', 'payeeId',
                                      'personAction', 'flow', 'categoryId', 'tagIds', 'notes', 'reference', 'status',
                                      'confirmed', 'plan', 'state'];
  r         public.transactions%rowtype;
  t         public.transactions%rowtype;
  v_exists  boolean;
  v_keys    text[];
  v_vkeys   text[];
  v_merge   jsonb;
  v_applied text[];
  v_today   date;
  v_moved   boolean;
begin
  if p_kind not in ('create', 'update', 'delete') or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'VALIDATION_FAILED';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_fields) k;
  if not (v_keys <@ c_fields) or (p_kind = 'update' and 'kind' = any(v_keys)) or (p_kind = 'delete' and cardinality(v_keys) > 0) then
    raise exception 'VALIDATION_FAILED';
  end if;
  -- Amount and split lines share one version (research R4-01); so do the two link fields (R7-03).
  if p_kind = 'update' and (('amountMinor' = any(v_keys)) <> ('lines' = any(v_keys))) then
    raise exception 'VALIDATION_FAILED';
  end if;
  if ('planItemId' = any(v_keys)) <> ('planMonth' = any(v_keys)) then
    raise exception 'INVALID_PLAN_LINK';
  end if;
  v_vkeys := array(select distinct case when k in ('planItemId', 'planMonth') then 'plan' else k end
                     from unnest(v_keys) k where k not in ('kind', 'lines'));

  if exists (select 1 from public.transactions x where x.id = p_id and x.user_id <> p_user) then
    raise exception '%', case when p_kind = 'create' then 'VALIDATION_FAILED' else 'NOT_FOUND' end;
  end if;
  select * into r from public.transactions x where x.id = p_id and x.user_id = p_user for update;
  v_exists := found;
  if (v_exists and r.state = 'deleted') or (not v_exists and p_kind <> 'create') then
    raise exception 'NOT_FOUND';
  end if;

  select (p_received_at at time zone coalesce(p.timezone, 'Asia/Kolkata'))::date into v_today
    from public.user_preferences p where p.user_id = p_user;
  v_today := coalesce(v_today, (p_received_at at time zone 'Asia/Kolkata')::date);

  -- ------------------------------------------------ create
  if p_kind = 'create' and not v_exists then
    if not (array['date', 'kind', 'amountMinor'] <@ v_keys) then
      raise exception 'VALIDATION_FAILED';
    end if;
    t.id := p_id;
    t.user_id := p_user;
    t.kind := (p_fields ->> 'kind')::public.transaction_kind;
    t.date := (p_fields ->> 'date')::date;
    t.time_of_day := (p_fields ->> 'timeOfDay')::time;
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
    t.reference := p_fields ->> 'reference';
    t.status := coalesce((p_fields ->> 'status')::public.transaction_status, 'uncleared');
    -- A future date is upcoming: never counted until confirmed when due (FR-002a).
    t.confirmed := coalesce((p_fields ->> 'confirmed')::boolean, true) and t.date <= v_today;
    t.plan_item_id := (p_fields ->> 'planItemId')::uuid;
    t.plan_month := (p_fields ->> 'planMonth')::date;
    perform app._validate_transaction(p_user, t, true);
    perform app._validate_plan_link(p_user, t, true);

    v_merge := app.merge_field_versions('{}'::jsonb, c_versions, p_hlc, p_received_at);
    v_merge := jsonb_set(v_merge, '{applied}', to_jsonb(v_keys));
    perform app._set_change_context(p_change_id, v_merge, false);
    insert into public.transactions (id, user_id, date, time_of_day, kind, flow, account_id, to_account_id, amount_minor,
                                     payee_id, person_action, category_id, lines, tag_ids, notes, reference, status,
                                     confirmed, plan_item_id, plan_month, field_versions)
    values (t.id, t.user_id, t.date, t.time_of_day, t.kind, t.flow, t.account_id, t.to_account_id, t.amount_minor,
            t.payee_id, t.person_action, t.category_id, t.lines, t.tag_ids, t.notes, t.reference, t.status,
            t.confirmed, t.plan_item_id, t.plan_month, v_merge -> 'fieldVersions');
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
    if 'date' = any(v_applied) then t.date := (p_fields ->> 'date')::date; end if;
    if 'timeOfDay' = any(v_applied) then t.time_of_day := (p_fields ->> 'timeOfDay')::time; end if;
    if 'accountId' = any(v_applied) then t.account_id := (p_fields ->> 'accountId')::uuid; end if;
    if 'toAccountId' = any(v_applied) then t.to_account_id := (p_fields ->> 'toAccountId')::uuid; end if;
    if 'amountMinor' = any(v_applied) then
      t.amount_minor := (p_fields ->> 'amountMinor')::bigint;
      t.lines := coalesce(p_fields -> 'lines', '[]'::jsonb);
      -- An edited interest proposal is the user's from now on (FR-014).
      if r.generated then t.user_edited := true; end if;
    end if;
    if 'payeeId' = any(v_applied) then t.payee_id := (p_fields ->> 'payeeId')::uuid; end if;
    if 'personAction' = any(v_applied) then t.person_action := (p_fields ->> 'personAction')::public.person_action; end if;
    if 'flow' = any(v_applied) then t.flow := (p_fields ->> 'flow')::public.money_flow; end if;
    t.flow := app._flow_of(t.kind, t.person_action, t.flow);
    if 'categoryId' = any(v_applied) then t.category_id := (p_fields ->> 'categoryId')::uuid; end if;
    if 'tagIds' = any(v_applied) then t.tag_ids := app._uuid_array(p_fields -> 'tagIds'); end if;
    if 'notes' = any(v_applied) then t.notes := p_fields ->> 'notes'; end if;
    if 'reference' = any(v_applied) then t.reference := p_fields ->> 'reference'; end if;
    if 'status' = any(v_applied) then t.status := (p_fields ->> 'status')::public.transaction_status; end if;
    if 'confirmed' = any(v_applied) then t.confirmed := (p_fields ->> 'confirmed')::boolean; end if;
    if 'plan' = any(v_applied) then
      t.plan_item_id := (p_fields ->> 'planItemId')::uuid;
      t.plan_month := (p_fields ->> 'planMonth')::date;
    end if;
    -- Never counted before its date (FR-002a): a future date is upcoming again.
    if t.date > v_today then t.confirmed := false; end if;

    v_moved := t.account_id is distinct from r.account_id or t.to_account_id is distinct from r.to_account_id;
    perform app._validate_transaction(p_user, t, v_moved);
    perform app._validate_plan_link(p_user, t,
      (t.plan_item_id, t.plan_month) is distinct from (r.plan_item_id, r.plan_month));
    perform app._set_change_context(p_change_id, v_merge, false);
    update public.transactions x set
      date = t.date, time_of_day = t.time_of_day, flow = t.flow, account_id = t.account_id,
      to_account_id = t.to_account_id, amount_minor = t.amount_minor, payee_id = t.payee_id,
      person_action = t.person_action, category_id = t.category_id, lines = t.lines, tag_ids = t.tag_ids,
      notes = t.notes, reference = t.reference, status = t.status, confirmed = t.confirmed,
      user_edited = t.user_edited, plan_item_id = t.plan_item_id, plan_month = t.plan_month,
      field_versions = v_merge -> 'fieldVersions'
    where x.id = p_id and x.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  -- ------------------------------------------------ delete (soft; FR-020). The link fields stay.
  v_merge := app.merge_field_versions(r.field_versions, array['state'], p_hlc, p_received_at);
  if not ('state' = any(array(select jsonb_array_elements_text(v_merge -> 'applied')))) then
    return app._change_result('applied', v_merge);
  end if;
  perform app._set_change_context(p_change_id, v_merge, false);
  update public.transactions x set state = 'deleted', deleted_at = now(), field_versions = v_merge -> 'fieldVersions'
   where x.id = p_id and x.user_id = p_user;
  return app._change_result('applied', v_merge);
end;
$$;

-- ---------------------------------------------------------------- merges and relocates reach plan items
-- As 20261101000011_tx_relocate.sql, also moving plan items (FR edge case: the item follows the merge).
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
  update public.plan_items i set category_id = p_target,
         field_versions = app._bump_version(i.field_versions, 'categoryId', p_hlc)
   where i.user_id = p_user and i.category_id = p_source;
  return v_a + v_b;
end;
$$;

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
  update public.plan_items i set payee_id = p_target,
         field_versions = app._bump_version(i.field_versions, 'payeeId', p_hlc)
   where i.user_id = p_user and i.payee_id = p_source;
  return v_a + v_b;
end;
$$;

revoke execute on function app._validate_plan_link(uuid, public.transactions, boolean) from public, anon, authenticated;
revoke execute on function app._apply_transaction(uuid, uuid, text, jsonb, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function app._repoint_category(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function app._repoint_payee(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
