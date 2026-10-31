-- T001 R6 fields (specs/006-dashboard-reports/data-model.md): a person's statement sign (synced) and the
-- user's safe-to-spend buffer (a preference).
--
-- REVIEW (constitution workflow — sync): `_apply_payee` is replaced (as 20261101000009_tx_payee_interest.sql)
-- only to accept and store `statementSign`.

create type public.statement_sign as enum ('they_owe_positive', 'i_owe_positive');
alter table public.payees add column statement_sign public.statement_sign not null default 'they_owe_positive';

alter table public.user_preferences add column buffer_minor bigint not null default 0
  check (buffer_minor between 0 and 999999999999);
grant update (buffer_minor) on public.user_preferences to authenticated;

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
                                      'openingBalanceDate', 'includeInNetWorth', 'interestMode', 'statementSign'];
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
  v_interest public.interest_mode;
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
                               opening_balance_date, include_in_net_worth, interest_mode, statement_sign, field_versions)
    values (p_id, p_user, v_name, (p_fields ->> 'kind')::public.payee_kind, v_category, p_fields ->> 'notes',
            coalesce((p_fields ->> 'hidden')::boolean, false), coalesce((p_fields ->> 'openingBalanceMinor')::bigint, 0),
            (p_fields ->> 'openingBalanceDate')::date, coalesce((p_fields ->> 'includeInNetWorth')::boolean, false),
            coalesce((p_fields ->> 'interestMode')::public.interest_mode, 'none'),
            coalesce((p_fields ->> 'statementSign')::public.statement_sign, 'they_owe_positive'), v_merge -> 'fieldVersions');
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
    v_interest := case when 'interestMode' = any(v_applied)
                       then (p_fields ->> 'interestMode')::public.interest_mode else r.interest_mode end;

    -- A person becomes a business only when settled (FR-014); the opening fields are cleared.
    if r.kind = 'person' and v_kind = 'business' then
      if app.person_balance_minor(p_id) - r.opening_balance_minor + v_opening <> 0 then
        raise exception 'BALANCE_NOT_ZERO';
      end if;
      v_opening := 0;
      v_date := null;
      v_include := false;
      v_interest := 'none';
      v_versions := app._bump_version(v_versions, 'interestMode', v_merge ->> 'hlc');
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
      interest_mode         = v_interest,
      statement_sign        = case when 'statementSign' = any(v_applied)
                                   then (p_fields ->> 'statementSign')::public.statement_sign else p.statement_sign end,
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
