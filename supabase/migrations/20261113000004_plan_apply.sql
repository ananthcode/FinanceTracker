-- T010 Writes for plan items and item months through the single write path
-- (specs/007-payment-plan/contracts/sync-protocol.md; research R7-01, R7-02, R7-03, R7-04).
--
-- REVIEW (constitution workflow — RLS / sync / money): runs inside app.apply_changes (SECURITY
-- DEFINER). Every row read or written has user_id = p_user (= auth.uid()); every referenced account,
-- card, payee and category must be the caller's own (composite foreign keys enforce it too; the
-- accounts inside `terms` are checked here). `terms` is one field version: two offline edits resolve
-- latest-wins as a whole. Item months have deterministic ids, so two devices creating the same month
-- merge per field.

-- ---------------------------------------------------------------- helpers
-- The user's "current month" for a change (R7-01): the month of the change's own time in the user's
-- timezone, never later than the server's month and never more than one month before it.
create or replace function app._plan_current_month(p_user uuid, p_hlc text, p_received_at timestamptz)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz     text;
  v_server date;
  v_change date;
begin
  select p.timezone into v_tz from public.user_preferences p where p.user_id = p_user;
  v_tz := coalesce(v_tz, 'Asia/Kolkata');
  v_server := date_trunc('month', p_received_at at time zone v_tz)::date;
  v_change := date_trunc('month', to_timestamp(split_part(p_hlc, '.', 1)::bigint / 1000.0) at time zone v_tz)::date;
  return greatest(least(v_change, v_server), (v_server - interval '1 month')::date);
end;
$$;

-- The term in force in a month, without its fromMonth (twin of termFor in packages/core/src/plan/months.ts).
create or replace function app._plan_term_at(p_terms jsonb, p_month date)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (select e.value - 'fromMonth' from jsonb_array_elements(p_terms) with ordinality e(value, n)
      where (e.value ->> 'fromMonth')::date <= p_month order by e.n desc limit 1),
    (p_terms -> 0) - 'fromMonth');
$$;

-- Checks an item as it would be stored (INVALID_PLAN_ITEM otherwise). With p_old, only references
-- that changed are checked, so an item still pointing at a since-deleted payee or account can be edited.
create or replace function app._validate_plan_item(p_user uuid, i public.plan_items, p_old public.plan_items)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_prev  date;
  v_month date;
  v_n     integer := 0;
  v_old   boolean := p_old.id is not null;
begin
  -- What it pays: the fields of its target only (the table checks it too).
  if not (case i.target
           when 'payee' then i.payee_id is not null and i.card_account_id is null and i.person_action is null
           when 'card' then i.card_account_id is not null and i.payee_id is null and i.category_id is null and i.person_action is null
           when 'person' then i.payee_id is not null and i.card_account_id is null and i.category_id is null
                              and i.person_action in ('lent', 'repaid_to', 'paid_on_behalf')
           else false end) then
    raise exception 'INVALID_PLAN_ITEM';
  end if;
  if i.payee_id is not null and (not v_old or i.payee_id is distinct from p_old.payee_id)
     and not exists (select 1 from public.payees p where p.id = i.payee_id and p.user_id = p_user and p.state <> 'deleted'
                       and p.kind = case when i.target = 'person' then 'person'::public.payee_kind else 'business'::public.payee_kind end) then
    raise exception 'INVALID_PLAN_ITEM';
  end if;
  if i.category_id is not null and (not v_old or i.category_id is distinct from p_old.category_id)
     and not exists (select 1 from public.categories c where c.id = i.category_id and c.user_id = p_user
                       and c.state <> 'deleted' and c.kind = 'expense') then
    raise exception 'INVALID_PLAN_ITEM';
  end if;
  if i.card_account_id is not null and (not v_old or i.card_account_id is distinct from p_old.card_account_id)
     and not exists (select 1 from public.accounts a where a.id = i.card_account_id and a.user_id = p_user
                       and a.state <> 'deleted' and a.type = 'credit_card') then
    raise exception 'INVALID_PLAN_ITEM';
  end if;

  -- Terms: objects in strictly increasing month order, the first from the start month.
  for v_entry in select e.value from jsonb_array_elements(i.terms) e loop
    v_n := v_n + 1;
    if jsonb_typeof(v_entry) <> 'object'
       or (select array_agg(k order by k) from jsonb_object_keys(v_entry) k) <> array['accountId', 'amountMinor', 'dueDay', 'fromMonth']
       or coalesce(v_entry ->> 'fromMonth', '') !~ '^\d{4}-\d{2}-01$'
       or jsonb_typeof(v_entry -> 'dueDay') <> 'number' or coalesce(v_entry ->> 'dueDay', '') !~ '^\d{1,2}$'
       or (v_entry ->> 'dueDay')::int not between 1 and 31
       or (jsonb_typeof(v_entry -> 'amountMinor') <> 'null' and coalesce(v_entry ->> 'amountMinor', '') !~ '^\d{1,12}$')
       or coalesce(v_entry ->> 'accountId', '') !~ '^[0-9a-f-]{36}$' then
      raise exception 'INVALID_PLAN_ITEM';
    end if;
    v_month := (v_entry ->> 'fromMonth')::date;
    if (v_n = 1 and v_month <> i.start_month) or (v_n > 1 and v_month <= v_prev) then
      raise exception 'INVALID_PLAN_ITEM';
    end if;
    v_prev := v_month;
    if jsonb_typeof(v_entry -> 'amountMinor') = 'null' then
      if not (i.target = 'card' or i.amount_varies) then
        raise exception 'INVALID_PLAN_ITEM';
      end if;
    elsif (v_entry ->> 'amountMinor')::bigint < 1 then
      raise exception 'INVALID_PLAN_ITEM';
    end if;
    -- The pay-from account: the caller's, not the card a card bill pays. Checked when new or changed.
    if (i.target = 'card' and (v_entry ->> 'accountId')::uuid = i.card_account_id)
       or ((not v_old or not (p_old.terms @> jsonb_build_array(v_entry)))
           and not exists (select 1 from public.accounts a where a.id = (v_entry ->> 'accountId')::uuid
                             and a.user_id = p_user and a.state <> 'deleted')) then
      raise exception 'INVALID_PLAN_ITEM';
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------- plan items
create or replace function app._apply_plan_item(
  p_user uuid, p_id uuid, p_kind text, p_fields jsonb, p_hlc text, p_options jsonb,
  p_received_at timestamptz, p_change_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_fields   constant text[] := array['name', 'target', 'payeeId', 'categoryId', 'cardAccountId', 'personAction', 'frequency',
                                      'intervalMonths', 'startMonth', 'endMonth', 'amountVaries', 'terms', 'notes'];
  -- intervalMonths shares the `frequency` version; target never changes.
  c_versions constant text[] := array['name', 'payeeId', 'categoryId', 'cardAccountId', 'personAction', 'frequency',
                                      'startMonth', 'endMonth', 'amountVaries', 'terms', 'notes', 'state'];
  r         public.plan_items%rowtype;
  t         public.plan_items%rowtype;
  v_none    public.plan_items%rowtype;
  v_exists  boolean;
  v_keys    text[];
  v_vkeys   text[];
  v_merge   jsonb;
  v_applied text[];
  v_current date;
  v_month   date;
begin
  if p_kind not in ('create', 'update', 'delete') or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'VALIDATION_FAILED';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_fields) k;
  if not (v_keys <@ c_fields) or (p_kind = 'delete' and cardinality(v_keys) > 0) then
    raise exception 'VALIDATION_FAILED';
  end if;
  if p_kind = 'update' and ('target' = any(v_keys) or (('frequency' = any(v_keys)) <> ('intervalMonths' = any(v_keys)))) then
    raise exception 'VALIDATION_FAILED';
  end if;
  if p_fields ? 'terms' and jsonb_typeof(p_fields -> 'terms') <> 'array' then
    raise exception 'VALIDATION_FAILED';
  end if;

  if exists (select 1 from public.plan_items x where x.id = p_id and x.user_id <> p_user) then
    raise exception '%', case when p_kind = 'create' then 'VALIDATION_FAILED' else 'NOT_FOUND' end;
  end if;
  select * into r from public.plan_items x where x.id = p_id and x.user_id = p_user for update;
  v_exists := found;
  if (v_exists and r.state = 'deleted') or (not v_exists and p_kind <> 'create') then
    raise exception 'NOT_FOUND';
  end if;

  -- ------------------------------------------------ create
  if p_kind = 'create' and not v_exists then
    if not (array['name', 'target', 'frequency', 'intervalMonths', 'startMonth', 'terms'] <@ v_keys) then
      raise exception 'VALIDATION_FAILED';
    end if;
    t.id := p_id;
    t.user_id := p_user;
    t.name := p_fields ->> 'name';
    t.target := (p_fields ->> 'target')::public.plan_target;
    t.payee_id := (p_fields ->> 'payeeId')::uuid;
    t.category_id := (p_fields ->> 'categoryId')::uuid;
    t.card_account_id := (p_fields ->> 'cardAccountId')::uuid;
    t.person_action := (p_fields ->> 'personAction')::public.person_action;
    t.frequency := (p_fields ->> 'frequency')::public.plan_frequency;
    t.interval_months := (p_fields ->> 'intervalMonths')::smallint;
    t.start_month := (p_fields ->> 'startMonth')::date;
    t.end_month := (p_fields ->> 'endMonth')::date;
    t.amount_varies := coalesce((p_fields ->> 'amountVaries')::boolean, false);
    t.terms := p_fields -> 'terms';
    t.notes := p_fields ->> 'notes';
    perform app._validate_plan_item(p_user, t, v_none);

    v_merge := app.merge_field_versions('{}'::jsonb, c_versions, p_hlc, p_received_at);
    v_merge := jsonb_set(v_merge, '{applied}', to_jsonb(v_keys));
    perform app._set_change_context(p_change_id, v_merge, false);
    insert into public.plan_items (id, user_id, name, target, payee_id, category_id, card_account_id, person_action, frequency,
                                   interval_months, start_month, end_month, amount_varies, terms, notes, field_versions)
    values (t.id, t.user_id, t.name, t.target, t.payee_id, t.category_id, t.card_account_id, t.person_action, t.frequency,
            t.interval_months, t.start_month, t.end_month, t.amount_varies, t.terms, t.notes, v_merge -> 'fieldVersions');
    return app._change_result('applied', v_merge);
  end if;

  -- ------------------------------------------------ update (also a create replayed for an existing row)
  if p_kind in ('create', 'update') then
    if p_kind = 'create' and (p_fields ->> 'target') is distinct from r.target::text then
      raise exception 'VALIDATION_FAILED';
    end if;
    v_vkeys := array(select k from unnest(v_keys) k where k not in ('target', 'intervalMonths'));
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
    if 'payeeId' = any(v_applied) then t.payee_id := (p_fields ->> 'payeeId')::uuid; end if;
    if 'categoryId' = any(v_applied) then t.category_id := (p_fields ->> 'categoryId')::uuid; end if;
    if 'cardAccountId' = any(v_applied) then t.card_account_id := (p_fields ->> 'cardAccountId')::uuid; end if;
    if 'personAction' = any(v_applied) then t.person_action := (p_fields ->> 'personAction')::public.person_action; end if;
    if 'frequency' = any(v_applied) then
      t.frequency := (p_fields ->> 'frequency')::public.plan_frequency;
      t.interval_months := (p_fields ->> 'intervalMonths')::smallint;
    end if;
    if 'startMonth' = any(v_applied) then t.start_month := (p_fields ->> 'startMonth')::date; end if;
    if 'endMonth' = any(v_applied) then t.end_month := (p_fields ->> 'endMonth')::date; end if;
    if 'amountVaries' = any(v_applied) then t.amount_varies := (p_fields ->> 'amountVaries')::boolean; end if;
    if 'terms' = any(v_applied) then t.terms := p_fields -> 'terms'; end if;
    if 'notes' = any(v_applied) then t.notes := p_fields ->> 'notes'; end if;

    perform app._validate_plan_item(p_user, t, r);

    -- Earlier months keep what they showed (FR-008, clarify Q5).
    if t.terms is distinct from r.terms or t.start_month is distinct from r.start_month then
      v_current := app._plan_current_month(p_user, v_merge ->> 'hlc', p_received_at);
      v_month := greatest(r.start_month, t.start_month);
      while v_month < v_current loop
        if app._plan_term_at(t.terms, v_month) is distinct from app._plan_term_at(r.terms, v_month) then
          raise exception 'TERMS_IN_PAST';
        end if;
        v_month := (v_month + interval '1 month')::date;
      end loop;
    end if;

    -- Months with payments stay months of the item (FR-008, R7-03).
    if (t.start_month, t.end_month, t.interval_months) is distinct from (r.start_month, r.end_month, r.interval_months)
       and exists (select 1 from public.transactions x
                    where x.user_id = p_user and x.plan_item_id = p_id and x.state = 'active' and x.status <> 'void'
                      and not app._plan_applies(t.start_month, t.end_month, t.interval_months, x.plan_month)) then
      raise exception 'HAS_PAYMENTS';
    end if;

    perform app._set_change_context(p_change_id, v_merge, false);
    update public.plan_items x set
      name = t.name, payee_id = t.payee_id, category_id = t.category_id, card_account_id = t.card_account_id,
      person_action = t.person_action, frequency = t.frequency, interval_months = t.interval_months,
      start_month = t.start_month, end_month = t.end_month, amount_varies = t.amount_varies, terms = t.terms,
      notes = t.notes, field_versions = v_merge -> 'fieldVersions'
    where x.id = p_id and x.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  -- ------------------------------------------------ delete (soft; links and paid months stay, FR-008)
  v_merge := app.merge_field_versions(r.field_versions, array['state'], p_hlc, p_received_at);
  if not ('state' = any(array(select jsonb_array_elements_text(v_merge -> 'applied')))) then
    return app._change_result('applied', v_merge);
  end if;
  perform app._set_change_context(p_change_id, v_merge, false);
  update public.plan_items x set state = 'deleted', deleted_at = now(), field_versions = v_merge -> 'fieldVersions'
   where x.id = p_id and x.user_id = p_user;
  return app._change_result('applied', v_merge);
end;
$$;

-- ---------------------------------------------------------------- item months (R7-02)
create or replace function app._apply_plan_occurrence(
  p_user uuid, p_id uuid, p_kind text, p_fields jsonb, p_hlc text, p_options jsonb,
  p_received_at timestamptz, p_change_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r         public.plan_occurrences%rowtype;
  v_item    public.plan_items%rowtype;
  v_exists  boolean;
  v_keys    text[];
  v_vkeys   text[];
  v_merge   jsonb;
  v_applied text[];
  v_item_id uuid;
  v_month   date;
begin
  if p_kind not in ('create', 'update') or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'VALIDATION_FAILED';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_fields) k;
  if (p_kind = 'create' and not (v_keys <@ array['itemId', 'month', 'amountMinor', 'skipped']))
     or (p_kind = 'update' and not (v_keys <@ array['amountMinor', 'skipped'])) then
    raise exception 'VALIDATION_FAILED';
  end if;
  v_vkeys := array(select k from unnest(v_keys) k where k in ('amountMinor', 'skipped'));
  if cardinality(v_vkeys) = 0 then
    raise exception 'VALIDATION_FAILED';
  end if;

  if exists (select 1 from public.plan_occurrences x where x.id = p_id and x.user_id <> p_user) then
    raise exception '%', case when p_kind = 'create' then 'INVALID_OCCURRENCE' else 'NOT_FOUND' end;
  end if;
  select * into r from public.plan_occurrences x where x.id = p_id and x.user_id = p_user for update;
  v_exists := found;
  if not v_exists and p_kind <> 'create' then
    raise exception 'NOT_FOUND';
  end if;

  v_item_id := coalesce(r.item_id, (p_fields ->> 'itemId')::uuid);
  v_month := coalesce(r.month, (p_fields ->> 'month')::date);
  if v_exists and p_kind = 'create'
     and ((p_fields ->> 'itemId')::uuid is distinct from r.item_id or (p_fields ->> 'month')::date is distinct from r.month) then
    raise exception 'INVALID_OCCURRENCE';
  end if;
  -- The id is derived from the item and month; the item is the caller's, live, and has the month.
  select * into v_item from public.plan_items i where i.id = v_item_id and i.user_id = p_user and i.state = 'active';
  if not found or p_id <> app._plan_occurrence_id(v_item_id, v_month)
     or not app._plan_applies(v_item.start_month, v_item.end_month, v_item.interval_months, v_month) then
    raise exception 'INVALID_OCCURRENCE';
  end if;
  if p_fields ? 'amountMinor' and jsonb_typeof(p_fields -> 'amountMinor') <> 'null'
     and coalesce(p_fields ->> 'amountMinor', '') !~ '^\d{1,12}$' then
    raise exception 'VALIDATION_FAILED';
  end if;

  if not v_exists then
    v_merge := app.merge_field_versions('{}'::jsonb, v_vkeys, p_hlc, p_received_at);
    perform app._set_change_context(p_change_id, v_merge, false);
    insert into public.plan_occurrences (id, user_id, item_id, month, amount_minor, skipped, field_versions)
    values (p_id, p_user, v_item_id, v_month, (p_fields ->> 'amountMinor')::bigint,
            coalesce((p_fields ->> 'skipped')::boolean, false), v_merge -> 'fieldVersions');
    return app._change_result('applied', v_merge);
  end if;

  v_merge := app.merge_field_versions(r.field_versions, v_vkeys, p_hlc, p_received_at);
  v_applied := array(select jsonb_array_elements_text(v_merge -> 'applied'));
  if cardinality(v_applied) = 0 then
    return app._change_result('applied', v_merge);
  end if;
  perform app._set_change_context(p_change_id, v_merge, false);
  update public.plan_occurrences x set
    amount_minor = case when 'amountMinor' = any(v_applied) then (p_fields ->> 'amountMinor')::bigint else x.amount_minor end,
    skipped = case when 'skipped' = any(v_applied) then (p_fields ->> 'skipped')::boolean else x.skipped end,
    field_versions = v_merge -> 'fieldVersions'
  where x.id = p_id and x.user_id = p_user;
  return app._change_result('applied', v_merge);
end;
$$;

-- ---------------------------------------------------------------- one change, exactly once
-- As 20261101000011_tx_relocate.sql, dispatching the R7 entities and mapping their codes.
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
                                        'INVALID_PLAN_LINK'];
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

revoke execute on function app._plan_current_month(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function app._plan_term_at(jsonb, date) from public, anon, authenticated;
revoke execute on function app._validate_plan_item(uuid, public.plan_items, public.plan_items) from public, anon, authenticated;
revoke execute on function app._apply_plan_item(uuid, uuid, text, jsonb, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function app._apply_plan_occurrence(uuid, uuid, text, jsonb, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function app._apply_one(uuid, jsonb, timestamptz) from public, anon, authenticated;
