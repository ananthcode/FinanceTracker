-- T014 Writes for transactions and person rates through the single write path
-- (R4 contracts/sync-protocol.md, research R4-01, R4-03, R4-04, R4-06).
--
-- REVIEW (constitution workflow — RLS / sync / money): runs inside app.apply_changes (SECURITY
-- DEFINER). Every row read or written has user_id = p_user (= auth.uid()); every referenced account,
-- payee, person, category and tag must be the caller's own (composite foreign keys enforce it too).
-- Amount and split lines share one field version, so they win or lose together.

-- ---------------------------------------------------------------- flow (research R4-03)
create or replace function app._flow_of(p_kind public.transaction_kind, p_action public.person_action, p_given public.money_flow)
returns public.money_flow
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind in ('expense', 'transfer') then 'out'::public.money_flow
    when p_kind in ('income', 'refund') then 'in'::public.money_flow
    when p_kind = 'person' and p_action in ('lent', 'repaid_to', 'paid_on_behalf') then 'out'::public.money_flow
    when p_kind = 'person' and p_action in ('borrowed', 'received_back', 'collected_on_behalf') then 'in'::public.money_flow
    else p_given end;
$$;

-- ---------------------------------------------------------------- validation
-- Raises a rejection code when the transaction as it would be stored breaks a rule. p_check_active:
-- the account(s) must be active (a new transaction, or one moved to another account — FR-006).
create or replace function app._validate_transaction(p_user uuid, t public.transactions, p_check_active boolean)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account record;
  v_payee   record;
  v_line    jsonb;
  v_count   integer := jsonb_array_length(t.lines);
  v_sum     bigint := 0;
  v_amount  bigint;
  v_cat     public.categories%rowtype;
  v_kind    public.category_kind := case when t.kind = 'income' then 'income' else 'expense' end::public.category_kind;
  v_share   text := case when t.flow = 'out' then 'paid_on_behalf' else 'collected_on_behalf' end;
  v_tag     text;
begin
  if t.flow is null or t.flow <> app._flow_of(t.kind, t.person_action, t.flow) then
    raise exception 'VALIDATION_FAILED';
  end if;

  -- Accounts: the caller's, not deleted; active when required; date not before the opening date.
  for v_account in select a.* from public.accounts a
                    where a.user_id = p_user and a.id in (t.account_id, t.to_account_id) loop
    if v_account.state = 'deleted' or (p_check_active and v_account.state <> 'active') then
      raise exception 'ACCOUNT_INACTIVE';
    end if;
    if t.date < v_account.opening_balance_date then
      raise exception 'DATE_BEFORE_OPENING';
    end if;
  end loop;
  if (t.account_id is not null and not exists (select 1 from public.accounts a where a.id = t.account_id and a.user_id = p_user))
     or (t.to_account_id is not null and not exists (select 1 from public.accounts a where a.id = t.to_account_id and a.user_id = p_user)) then
    raise exception 'VALIDATION_FAILED';
  end if;

  -- Payee: the caller's live payee; a person for person movements and interest.
  if t.payee_id is not null then
    select p.* into v_payee from public.payees p where p.id = t.payee_id and p.user_id = p_user and p.state <> 'deleted';
    if not found then
      raise exception 'VALIDATION_FAILED';
    end if;
    if t.kind in ('person', 'interest') then
      if v_payee.kind <> 'person' then
        raise exception 'INVALID_PERSON';
      end if;
      if t.date < v_payee.opening_balance_date then
        raise exception 'DATE_BEFORE_OPENING';
      end if;
    end if;
  end if;
  if t.kind = 'person' and t.person_action = 'adjustment' and coalesce(btrim(t.notes), '') = '' then
    raise exception 'VALIDATION_FAILED';
  end if;

  -- Category: the caller's live category of the matching kind; none on a split.
  if t.category_id is not null then
    select c.* into v_cat from public.categories c where c.id = t.category_id and c.user_id = p_user and c.state <> 'deleted';
    if not found or v_cat.kind <> v_kind or t.kind not in ('expense', 'income', 'refund') then
      raise exception 'INVALID_CATEGORY';
    end if;
  end if;

  -- Split lines (FR-012).
  if v_count > 0 then
    if t.kind not in ('expense', 'income', 'refund') or t.category_id is not null or v_count < 2 or v_count > 50 then
      raise exception 'VALIDATION_FAILED';
    end if;
    for v_line in select e.value from jsonb_array_elements(t.lines) e loop
      if jsonb_typeof(v_line) <> 'object' or coalesce(v_line ->> 'amountMinor', '') !~ '^\d{1,12}$' then
        raise exception 'VALIDATION_FAILED';
      end if;
      v_amount := (v_line ->> 'amountMinor')::bigint;
      if v_amount < 1 or char_length(coalesce(v_line ->> 'notes', '')) > 500 then
        raise exception 'VALIDATION_FAILED';
      end if;
      v_sum := v_sum + v_amount;
      if v_line ->> 'personId' is not null then
        if v_line ->> 'categoryId' is not null or v_line ->> 'personAction' is distinct from v_share then
          raise exception 'VALIDATION_FAILED';
        end if;
        if not exists (select 1 from public.payees p where p.id = (v_line ->> 'personId')::uuid and p.user_id = p_user
                         and p.state <> 'deleted' and p.kind = 'person') then
          raise exception 'INVALID_PERSON';
        end if;
      elsif v_line ->> 'categoryId' is not null then
        if not exists (select 1 from public.categories c where c.id = (v_line ->> 'categoryId')::uuid and c.user_id = p_user
                         and c.state <> 'deleted' and c.kind = v_kind) then
          raise exception 'INVALID_CATEGORY';
        end if;
      end if;
      for v_tag in select jsonb_array_elements_text(coalesce(v_line -> 'tagIds', '[]'::jsonb)) loop
        if not exists (select 1 from public.tags g where g.id = v_tag::uuid and g.user_id = p_user and g.state <> 'deleted') then
          raise exception 'VALIDATION_FAILED';
        end if;
      end loop;
    end loop;
    if v_sum <> t.amount_minor then
      raise exception 'LINES_MISMATCH';
    end if;
  end if;

  if exists (select 1 from unnest(t.tag_ids) g
              where not exists (select 1 from public.tags x where x.id = g and x.user_id = p_user and x.state <> 'deleted')) then
    raise exception 'VALIDATION_FAILED';
  end if;
end;
$$;

-- jsonb array of uuid strings → uuid[]
create or replace function app._uuid_array(p jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(select jsonb_array_elements_text(coalesce(p, '[]'::jsonb))::uuid), '{}');
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
                                      'status', 'confirmed'];
  c_versions constant text[] := array['date', 'timeOfDay', 'accountId', 'toAccountId', 'amountMinor', 'payeeId',
                                      'personAction', 'flow', 'categoryId', 'tagIds', 'notes', 'reference', 'status',
                                      'confirmed', 'state'];
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
  -- Amount and split lines share one version (research R4-01).
  if p_kind = 'update' and (('amountMinor' = any(v_keys)) <> ('lines' = any(v_keys))) then
    raise exception 'VALIDATION_FAILED';
  end if;
  v_vkeys := array(select distinct k from unnest(v_keys) k where k not in ('kind', 'lines'));

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
    perform app._validate_transaction(p_user, t, true);

    v_merge := app.merge_field_versions('{}'::jsonb, c_versions, p_hlc, p_received_at);
    v_merge := jsonb_set(v_merge, '{applied}', to_jsonb(v_keys));
    perform app._set_change_context(p_change_id, v_merge, false);
    insert into public.transactions (id, user_id, date, time_of_day, kind, flow, account_id, to_account_id, amount_minor,
                                     payee_id, person_action, category_id, lines, tag_ids, notes, reference, status,
                                     confirmed, field_versions)
    values (t.id, t.user_id, t.date, t.time_of_day, t.kind, t.flow, t.account_id, t.to_account_id, t.amount_minor,
            t.payee_id, t.person_action, t.category_id, t.lines, t.tag_ids, t.notes, t.reference, t.status,
            t.confirmed, v_merge -> 'fieldVersions');
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
    -- Never counted before its date (FR-002a): a future date is upcoming again.
    if t.date > v_today then t.confirmed := false; end if;

    v_moved := t.account_id is distinct from r.account_id or t.to_account_id is distinct from r.to_account_id;
    perform app._validate_transaction(p_user, t, v_moved);
    perform app._set_change_context(p_change_id, v_merge, false);
    update public.transactions x set
      date = t.date, time_of_day = t.time_of_day, flow = t.flow, account_id = t.account_id,
      to_account_id = t.to_account_id, amount_minor = t.amount_minor, payee_id = t.payee_id,
      person_action = t.person_action, category_id = t.category_id, lines = t.lines, tag_ids = t.tag_ids,
      notes = t.notes, reference = t.reference, status = t.status, confirmed = t.confirmed,
      user_edited = t.user_edited, field_versions = v_merge -> 'fieldVersions'
    where x.id = p_id and x.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  -- ------------------------------------------------ delete (soft; FR-020)
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

-- ---------------------------------------------------------------- person rates (FR-013)
create or replace function app._apply_person_rate(
  p_user uuid, p_id uuid, p_kind text, p_fields jsonb, p_hlc text, p_options jsonb,
  p_received_at timestamptz, p_change_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        public.person_rates%rowtype;
  v_exists boolean;
  v_keys   text[];
  v_merge  jsonb;
  v_applied text[];
begin
  if p_kind not in ('create', 'update', 'delete') or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'VALIDATION_FAILED';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_fields) k;
  if (p_kind = 'create' and not (v_keys <@ array['payeeId', 'effectiveMonth', 'rateE4']))
     or (p_kind = 'update' and not (v_keys <@ array['effectiveMonth', 'rateE4']))
     or (p_kind = 'delete' and cardinality(v_keys) > 0) then
    raise exception 'VALIDATION_FAILED';
  end if;
  if exists (select 1 from public.person_rates x where x.id = p_id and x.user_id <> p_user) then
    raise exception '%', case when p_kind = 'create' then 'VALIDATION_FAILED' else 'NOT_FOUND' end;
  end if;
  select * into r from public.person_rates x where x.id = p_id and x.user_id = p_user for update;
  v_exists := found;
  if (v_exists and r.state = 'deleted') or (not v_exists and p_kind <> 'create') then
    raise exception 'NOT_FOUND';
  end if;

  if p_kind = 'create' and not v_exists then
    if not (array['payeeId', 'effectiveMonth', 'rateE4'] <@ v_keys) then
      raise exception 'VALIDATION_FAILED';
    end if;
    if not exists (select 1 from public.payees p where p.id = (p_fields ->> 'payeeId')::uuid and p.user_id = p_user
                     and p.state <> 'deleted' and p.kind = 'person') then
      raise exception 'INVALID_PERSON';
    end if;
    v_merge := app.merge_field_versions('{}'::jsonb, array['effectiveMonth', 'rateE4', 'state'], p_hlc, p_received_at);
    v_merge := jsonb_set(v_merge, '{applied}', to_jsonb(v_keys));
    perform app._set_change_context(p_change_id, v_merge, false);
    insert into public.person_rates (id, user_id, payee_id, effective_month, rate_e4, field_versions)
    values (p_id, p_user, (p_fields ->> 'payeeId')::uuid, (p_fields ->> 'effectiveMonth')::date,
            (p_fields ->> 'rateE4')::integer, v_merge -> 'fieldVersions');
    return app._change_result('applied', v_merge);
  end if;

  if p_kind in ('create', 'update') then
    v_keys := array(select k from unnest(v_keys) k where k <> 'payeeId');
    if cardinality(v_keys) = 0 then
      raise exception 'VALIDATION_FAILED';
    end if;
    v_merge := app.merge_field_versions(r.field_versions, v_keys, p_hlc, p_received_at);
    v_applied := array(select jsonb_array_elements_text(v_merge -> 'applied'));
    if cardinality(v_applied) = 0 then
      return app._change_result('applied', v_merge);
    end if;
    perform app._set_change_context(p_change_id, v_merge, false);
    update public.person_rates x set
      effective_month = case when 'effectiveMonth' = any(v_applied) then (p_fields ->> 'effectiveMonth')::date else x.effective_month end,
      rate_e4 = case when 'rateE4' = any(v_applied) then (p_fields ->> 'rateE4')::integer else x.rate_e4 end,
      field_versions = v_merge -> 'fieldVersions'
    where x.id = p_id and x.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  v_merge := app.merge_field_versions(r.field_versions, array['state'], p_hlc, p_received_at);
  if not ('state' = any(array(select jsonb_array_elements_text(v_merge -> 'applied')))) then
    return app._change_result('applied', v_merge);
  end if;
  perform app._set_change_context(p_change_id, v_merge, false);
  update public.person_rates x set state = 'deleted', deleted_at = now(), field_versions = v_merge -> 'fieldVersions'
   where x.id = p_id and x.user_id = p_user;
  return app._change_result('applied', v_merge);
end;
$$;

-- ---------------------------------------------------------------- one change, exactly once (R2-03)
-- As 20261028000005_lists_apply.sql, dispatching the R4 entities and mapping their codes.
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
      when 'category' then app._apply_category(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id)
      when 'tag' then app._apply_tag(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id)
      when 'payee' then app._apply_payee(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id)
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

-- ---------------------------------------------------------------- history: confirmations are named
create or replace function audit.capture_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family  text := tg_argv[0];
  v_before  jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_after   jsonb := to_jsonb(new);
  v_changes jsonb;
  v_keys    text[];
  v_context jsonb := coalesce(nullif(current_setting('app.change_context', true), '')::jsonb, '{}'::jsonb);
  v_device  text := nullif(current_setting('app.device_type', true), '');
  v_action  text;
begin
  select coalesce(jsonb_object_agg(a.key, jsonb_build_object('before', v_before -> a.key, 'after', a.value)), '{}'::jsonb)
    into v_changes
    from jsonb_each(v_after) a
   where a.key not in ('id', 'user_id', 'server_seq', 'field_versions', 'created_at', 'updated_at')
     and (tg_op = 'INSERT' or (v_before -> a.key) is distinct from a.value);

  if v_changes = '{}'::jsonb then
    return new;
  end if;
  select array_agg(k) into v_keys from jsonb_object_keys(v_changes) k;

  if tg_op = 'INSERT' then
    v_action := case when (v_context ->> 'renamed')::boolean then v_family || '_sync_renamed' else v_family || '_created' end;
  elsif v_changes ? 'state' then
    v_action := v_family || case
                  when v_after ->> 'state' = 'archived' then '_archived'
                  when v_after ->> 'state' = 'deleted' and v_after ->> 'merged_into' is not null then '_merged'
                  when v_after ->> 'state' = 'deleted' then '_deleted'
                  else '_restored' end;
  elsif v_family in ('account', 'account_group') and v_keys <@ array['sort_key'] then
    v_action := v_family || '_reordered';
  elsif v_family in ('category', 'payee') and v_keys <@ array['hidden'] then
    v_action := v_family || case when (v_after ->> 'hidden')::boolean then '_hidden' else '_unhidden' end;
  elsif v_family = 'category' and v_keys <@ array['parent_id'] then
    v_action := 'category_moved';
  elsif v_family = 'transaction' and v_keys <@ array['confirmed'] and (v_after ->> 'confirmed')::boolean then
    v_action := 'transaction_confirmed';
  else
    v_action := case v_family when 'account_group' then 'account_group_renamed'
                               when 'tag' then 'tag_renamed'
                               else v_family || '_edited' end;
  end if;

  perform app.write_audit(
    v_action::public.audit_action,
    auth.uid(),
    null,
    v_family,
    new.id,
    null,
    case when v_device in ('web', 'android') then v_device end,
    jsonb_build_object('ownerId', new.user_id, 'changes', v_changes)
      || (v_context - 'renamed' - 'action'));
  return new;
end;
$$;

revoke execute on function audit.capture_record_change() from public, anon, authenticated;
revoke execute on function app._flow_of(public.transaction_kind, public.person_action, public.money_flow) from public, anon, authenticated;
revoke execute on function app._validate_transaction(uuid, public.transactions, boolean) from public, anon, authenticated;
revoke execute on function app._uuid_array(jsonb) from public, anon, authenticated;
revoke execute on function app._apply_transaction(uuid, uuid, text, jsonb, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function app._apply_person_rate(uuid, uuid, text, jsonb, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function app._apply_one(uuid, jsonb, timestamptz) from public, anon, authenticated;
