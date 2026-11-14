-- T011 Attachment records, warranty fields and attachment clean-up (specs/009-attachments-warranty research
-- R9-02, R9-03, R9-05).
--
-- REVIEW (constitution workflow — RLS / sync / storage): an attachment record is accepted only when its
-- file is already stored in the caller's folder with the same size and type (no record without its file,
-- FR-007), on the caller's own live transaction, at most 10 live per transaction, and while the caller's
-- stored bytes stay within 200 MB. `_apply_transaction` is replaced (as 20261113000005_plan_links.sql) to
-- accept and check the warranty fields and to delete a transaction's attachment records with it; the files
-- are then removed through the Storage API by the deleting client, or by the clean-up below.

-- ---------------------------------------------------------------- warranty rules
create or replace function app._warranty_dismissed(p_value jsonb)
returns smallint
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or p_value = 'null'::jsonb then
    return 0;
  end if;
  if jsonb_typeof(p_value) <> 'number' or p_value::text not in ('0', '1', '2') then
    raise exception 'INVALID_WARRANTY';
  end if;
  return (p_value::text)::smallint;
end;
$$;

create or replace function app._validate_warranty(t public.transactions)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if t.warranty_until is null then
    if t.warranty_note is not null then
      raise exception 'INVALID_WARRANTY';
    end if;
    return;
  end if;
  -- On or after the purchase, and within 30 years of it.
  if t.warranty_until < t.date or t.warranty_until > (t.date + interval '30 years')::date then
    raise exception 'INVALID_WARRANTY';
  end if;
  if t.warranty_note is not null
     and (char_length(t.warranty_note) not between 1 and 200 or t.warranty_note <> btrim(t.warranty_note)) then
    raise exception 'INVALID_WARRANTY';
  end if;
end;
$$;

-- ---------------------------------------------------------------- attachments
create or replace function app._apply_attachment(
  p_user uuid, p_id uuid, p_kind text, p_fields jsonb, p_hlc text, p_options jsonb,
  p_received_at timestamptz, p_change_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_fields   constant text[] := array['transactionId', 'name', 'contentType', 'sizeBytes'];
  -- The file never changes: only the name can be edited.
  c_versions constant text[] := array['name', 'state'];
  r         public.attachments%rowtype;
  a         public.attachments%rowtype;
  v_exists  boolean;
  v_keys    text[];
  v_merge   jsonb;
  v_applied text[];
  v_object  jsonb;
begin
  if p_kind not in ('create', 'update', 'delete') or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'VALIDATION_FAILED';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_fields) k;
  if not (v_keys <@ c_fields)
     or (p_kind = 'update' and not (v_keys <@ array['name']))
     or (p_kind = 'delete' and cardinality(v_keys) > 0) then
    raise exception 'VALIDATION_FAILED';
  end if;

  if exists (select 1 from public.attachments x where x.id = p_id and x.user_id <> p_user) then
    raise exception '%', case when p_kind = 'create' then 'VALIDATION_FAILED' else 'NOT_FOUND' end;
  end if;
  select * into r from public.attachments x where x.id = p_id and x.user_id = p_user for update;
  v_exists := found;
  if (v_exists and r.state = 'deleted') or (not v_exists and p_kind <> 'create') then
    raise exception 'NOT_FOUND';
  end if;

  -- ------------------------------------------------ create
  if p_kind = 'create' and not v_exists then
    if not (c_fields <@ v_keys) or jsonb_typeof(p_fields -> 'sizeBytes') <> 'string'
       or (p_fields ->> 'sizeBytes') !~ '^[1-9][0-9]{0,8}$' then
      raise exception 'INVALID_ATTACHMENT';
    end if;
    a.id := p_id;
    a.user_id := p_user;
    a.transaction_id := (p_fields ->> 'transactionId')::uuid;
    a.name := p_fields ->> 'name';
    a.content_type := p_fields ->> 'contentType';
    a.size_bytes := (p_fields ->> 'sizeBytes')::bigint;
    if a.name is null or char_length(a.name) not between 1 and 120 or a.name <> btrim(a.name)
       or a.content_type is null
       or a.content_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
       or a.size_bytes not between 1 and 10485760 then
      raise exception 'INVALID_ATTACHMENT';
    end if;
    -- The caller's own live transaction.
    if not exists (select 1 from public.transactions t
                    where t.id = a.transaction_id and t.user_id = p_user and t.state = 'active') then
      raise exception 'INVALID_ATTACHMENT';
    end if;
    -- The file is stored, complete, in the caller's folder (FR-007).
    select o.metadata into v_object from storage.objects o
     where o.bucket_id = 'attachments' and o.name = p_user::text || '/' || p_id::text;
    if v_object is null
       or (v_object ->> 'size') is distinct from a.size_bytes::text
       or lower(v_object ->> 'mimetype') is distinct from a.content_type then
      raise exception 'INVALID_ATTACHMENT';
    end if;
    if (select count(*) from public.attachments x
         where x.user_id = p_user and x.transaction_id = a.transaction_id and x.state = 'active') >= 10 then
      raise exception 'LIMIT_REACHED';
    end if;
    -- What is stored, this file included, stays within the allowance (clarify Q1).
    if app.attachment_bytes(p_user) > 209715200 then
      raise exception 'QUOTA_EXCEEDED';
    end if;

    v_merge := app.merge_field_versions('{}'::jsonb, c_versions, p_hlc, p_received_at);
    v_merge := jsonb_set(v_merge, '{applied}', to_jsonb(v_keys));
    perform app._set_change_context(p_change_id, v_merge, false);
    insert into public.attachments (id, user_id, transaction_id, name, content_type, size_bytes, field_versions)
    values (a.id, a.user_id, a.transaction_id, a.name, a.content_type, a.size_bytes, v_merge -> 'fieldVersions');
    return app._change_result('applied', v_merge);
  end if;

  -- ------------------------------------------------ rename (also a create replayed for an existing row)
  if p_kind in ('create', 'update') then
    if p_kind = 'create' and ((p_fields ->> 'transactionId')::uuid is distinct from r.transaction_id
                              or (p_fields ->> 'contentType') is distinct from r.content_type
                              or (p_fields ->> 'sizeBytes') is distinct from r.size_bytes::text) then
      raise exception 'VALIDATION_FAILED';
    end if;
    if not ('name' = any(v_keys)) then
      raise exception 'VALIDATION_FAILED';
    end if;
    v_merge := app.merge_field_versions(r.field_versions, array['name'], p_hlc, p_received_at);
    v_applied := array(select jsonb_array_elements_text(v_merge -> 'applied'));
    if cardinality(v_applied) = 0 then
      return app._change_result('applied', v_merge);
    end if;
    a := r;
    a.name := p_fields ->> 'name';
    if a.name is null or char_length(a.name) not between 1 and 120 or a.name <> btrim(a.name) then
      raise exception 'INVALID_ATTACHMENT';
    end if;
    perform app._set_change_context(p_change_id, v_merge, false);
    update public.attachments x set name = a.name, field_versions = v_merge -> 'fieldVersions'
     where x.id = p_id and x.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  -- ------------------------------------------------ delete (soft; the file is removed by the client, R9-03)
  v_merge := app.merge_field_versions(r.field_versions, array['state'], p_hlc, p_received_at);
  if not ('state' = any(array(select jsonb_array_elements_text(v_merge -> 'applied')))) then
    return app._change_result('applied', v_merge);
  end if;
  perform app._set_change_context(p_change_id, v_merge, false);
  update public.attachments x set state = 'deleted', deleted_at = now(), field_versions = v_merge -> 'fieldVersions'
   where x.id = p_id and x.user_id = p_user;
  return app._change_result('applied', v_merge);
end;
$$;

-- ---------------------------------------------------------------- transactions
-- As 20261113000005_plan_links.sql, with the warranty fields (R9-05) and attachments going with a delete.
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
                                      'status', 'confirmed', 'planItemId', 'planMonth', 'warrantyUntil',
                                      'warrantyNote', 'warrantyDismissed'];
  c_versions constant text[] := array['date', 'timeOfDay', 'accountId', 'toAccountId', 'amountMinor', 'payeeId',
                                      'personAction', 'flow', 'categoryId', 'tagIds', 'notes', 'reference', 'status',
                                      'confirmed', 'plan', 'warranty', 'warrantyDismissed', 'state'];
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
  -- R9: the expiry and its note share one version `warranty` (research R9-05).
  if ('warrantyUntil' = any(v_keys)) <> ('warrantyNote' = any(v_keys)) then
    raise exception 'INVALID_WARRANTY';
  end if;
  v_vkeys := array(select distinct case when k in ('planItemId', 'planMonth') then 'plan'
                                        when k in ('warrantyUntil', 'warrantyNote') then 'warranty' else k end
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
    t.warranty_until := (p_fields ->> 'warrantyUntil')::date;
    t.warranty_note := p_fields ->> 'warrantyNote';
    t.warranty_dismissed := app._warranty_dismissed(p_fields -> 'warrantyDismissed');
    perform app._validate_transaction(p_user, t, true);
    perform app._validate_plan_link(p_user, t, true);
    perform app._validate_warranty(t);

    v_merge := app.merge_field_versions('{}'::jsonb, c_versions, p_hlc, p_received_at);
    v_merge := jsonb_set(v_merge, '{applied}', to_jsonb(v_keys));
    perform app._set_change_context(p_change_id, v_merge, false);
    insert into public.transactions (id, user_id, date, time_of_day, kind, flow, account_id, to_account_id, amount_minor,
                                     payee_id, person_action, category_id, lines, tag_ids, notes, reference, status,
                                     confirmed, plan_item_id, plan_month, warranty_until, warranty_note,
                                     warranty_dismissed, field_versions)
    values (t.id, t.user_id, t.date, t.time_of_day, t.kind, t.flow, t.account_id, t.to_account_id, t.amount_minor,
            t.payee_id, t.person_action, t.category_id, t.lines, t.tag_ids, t.notes, t.reference, t.status,
            t.confirmed, t.plan_item_id, t.plan_month, t.warranty_until, t.warranty_note, t.warranty_dismissed,
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
    if 'warrantyDismissed' = any(v_applied) then
      t.warranty_dismissed := app._warranty_dismissed(p_fields -> 'warrantyDismissed');
    end if;
    if 'warranty' = any(v_applied) then
      t.warranty_until := (p_fields ->> 'warrantyUntil')::date;
      t.warranty_note := p_fields ->> 'warrantyNote';
      -- A new expiry starts its reminders again (research R9-05), unless this change says otherwise.
      if t.warranty_until is distinct from r.warranty_until and not ('warrantyDismissed' = any(v_applied)) then
        t.warranty_dismissed := 0;
        v_merge := jsonb_set(v_merge, '{fieldVersions}',
                             app._bump_version(v_merge -> 'fieldVersions', 'warrantyDismissed', p_hlc));
      end if;
    end if;
    -- Never counted before its date (FR-002a): a future date is upcoming again.
    if t.date > v_today then t.confirmed := false; end if;

    v_moved := t.account_id is distinct from r.account_id or t.to_account_id is distinct from r.to_account_id;
    perform app._validate_transaction(p_user, t, v_moved);
    perform app._validate_plan_link(p_user, t,
      (t.plan_item_id, t.plan_month) is distinct from (r.plan_item_id, r.plan_month));
    perform app._validate_warranty(t);
    perform app._set_change_context(p_change_id, v_merge, false);
    update public.transactions x set
      date = t.date, time_of_day = t.time_of_day, flow = t.flow, account_id = t.account_id,
      to_account_id = t.to_account_id, amount_minor = t.amount_minor, payee_id = t.payee_id,
      person_action = t.person_action, category_id = t.category_id, lines = t.lines, tag_ids = t.tag_ids,
      notes = t.notes, reference = t.reference, status = t.status, confirmed = t.confirmed,
      user_edited = t.user_edited, plan_item_id = t.plan_item_id, plan_month = t.plan_month,
      warranty_until = t.warranty_until, warranty_note = t.warranty_note, warranty_dismissed = t.warranty_dismissed,
      field_versions = v_merge -> 'fieldVersions'
    where x.id = p_id and x.user_id = p_user;
    return app._change_result('applied', v_merge);
  end if;

  -- ------------------------------------------------ delete (soft; FR-020). The link fields stay; the
  -- attachments go with it (clarify Q2): their records now, their files by the deleting client (R9-03).
  v_merge := app.merge_field_versions(r.field_versions, array['state'], p_hlc, p_received_at);
  if not ('state' = any(array(select jsonb_array_elements_text(v_merge -> 'applied')))) then
    return app._change_result('applied', v_merge);
  end if;
  perform app._set_change_context(p_change_id, v_merge, false);
  update public.transactions x set state = 'deleted', deleted_at = now(), field_versions = v_merge -> 'fieldVersions'
   where x.id = p_id and x.user_id = p_user;
  update public.attachments a set state = 'deleted', deleted_at = now(),
         field_versions = app._bump_version(a.field_versions, 'state', p_hlc)
   where a.user_id = p_user and a.transaction_id = p_id and a.state = 'active';
  return app._change_result('applied', v_merge);
end;
$$;

-- ---------------------------------------------------------------- one change, exactly once
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
                                        'INVALID_PLAN_LINK', 'INVALID_TEMPLATE', 'INVALID_ATTACHMENT',
                                        'QUOTA_EXCEEDED', 'INVALID_WARRANTY'];
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
      when 'attachment' then app._apply_attachment(p_user, v_entity_id, v_kind, v_fields, p_change ->> 'hlc', p_change -> 'options', p_received_at, v_change_id)
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

-- ---------------------------------------------------------------- usage and clean-up (research R9-03)
-- What the caller stores: files and bytes in their folder (Settings › Your data, clarify Q1).
create or replace function app.my_attachment_usage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'files', count(*),
           'bytes', coalesce(sum((o.metadata ->> 'size')::bigint), 0)::text,
           'allowance', '209715200')
    from storage.objects o
   where o.bucket_id = 'attachments' and o.name like (select auth.uid())::text || '/%'
     and (select app.is_active_user());
$$;

-- The caller's files that no live record needs: deleted attachments, and uploads whose record never
-- arrived within an hour. The caller's client removes them through the Storage API.
create or replace function app.my_orphan_attachment_files()
returns setof text
language sql
stable
security invoker
set search_path = ''
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'attachments' and o.name like (select auth.uid())::text || '/%'
     and not exists (select 1 from public.attachments a
                      where a.user_id = (select auth.uid()) and a.state = 'active'
                        and o.name = a.user_id::text || '/' || a.id::text)
     and (exists (select 1 from public.attachments a
                   where a.user_id = (select auth.uid()) and o.name = a.user_id::text || '/' || a.id::text)
          or o.created_at < now() - interval '1 hour')
   order by o.name
   limit 100;
$$;

revoke execute on function app._warranty_dismissed(jsonb) from public, anon, authenticated;
revoke execute on function app._validate_warranty(public.transactions) from public, anon, authenticated;
revoke execute on function app._apply_attachment(uuid, uuid, text, jsonb, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function app._apply_transaction(uuid, uuid, text, jsonb, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function app._apply_one(uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function app.my_attachment_usage() from public, anon;
grant execute on function app.my_attachment_usage() to authenticated;
revoke execute on function app.my_orphan_attachment_files() from public, anon;
grant execute on function app.my_orphan_attachment_files() to authenticated;
