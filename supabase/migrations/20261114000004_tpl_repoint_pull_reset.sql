-- T011 Merges, relocates and tag deletes reach templates; pull, reset, demo load and erasure learn them
-- (specs/008-quick-add-templates research R8-07). Each function is the R4/R7 one (20261113000005_plan_links.sql,
-- 20261101000011_tx_relocate.sql, 20261113000006_plan_pull_reset.sql) with templates added.
--
-- REVIEW (constitution workflow — RLS / sync / erasure): template updates bump field versions so devices
-- pull the change; every statement filters on the caller's user_id. Pull stays INVOKER; reset, demo load
-- and erasure stay DEFINER for auth.uid() only.

-- ---------------------------------------------------------------- repoint
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
  -- R8: templates follow too (their category, and split lines' categories with the amount's version).
  update public.transaction_templates x set category_id = p_target,
         field_versions = app._bump_version(x.field_versions, 'categoryId', p_hlc)
   where x.user_id = p_user and x.category_id = p_source;
  update public.transaction_templates x set
         lines = (select jsonb_agg(case when e.l ->> 'categoryId' = p_source::text
                                        then jsonb_set(e.l, '{categoryId}', to_jsonb(p_target::text)) else e.l end order by e.n)
                    from jsonb_array_elements(x.lines) with ordinality e(l, n)),
         field_versions = app._bump_version(x.field_versions, 'amountMinor', p_hlc)
   where x.user_id = p_user
     and exists (select 1 from jsonb_array_elements(x.lines) l where l ->> 'categoryId' = p_source::text);
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
  -- R8: templates follow too (their payee or person, and person shares in split lines).
  update public.transaction_templates x set payee_id = p_target,
         field_versions = app._bump_version(x.field_versions, 'payeeId', p_hlc)
   where x.user_id = p_user and x.payee_id = p_source;
  update public.transaction_templates x set
         lines = (select jsonb_agg(case when e.l ->> 'personId' = p_source::text
                                        then jsonb_set(e.l, '{personId}', to_jsonb(p_target::text)) else e.l end order by e.n)
                    from jsonb_array_elements(x.lines) with ordinality e(l, n)),
         field_versions = app._bump_version(x.field_versions, 'amountMinor', p_hlc)
   where x.user_id = p_user
     and exists (select 1 from jsonb_array_elements(x.lines) l where l ->> 'personId' = p_source::text);
  return v_a + v_b;
end;
$$;

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
  -- R8: templates follow too (FR-015): replaced by the merge target, or removed for a deleted tag.
  update public.transaction_templates x set
         tag_ids = case when p_target is null or p_target = any(x.tag_ids) then array_remove(x.tag_ids, p_source)
                        else array_replace(x.tag_ids, p_source, p_target) end,
         field_versions = app._bump_version(x.field_versions, 'tagIds', p_hlc)
   where x.user_id = p_user and p_source = any(x.tag_ids);
  update public.transaction_templates x set
         lines = (select jsonb_agg(case when e.l -> 'tagIds' ? p_source::text then
                    jsonb_set(e.l, '{tagIds}', (
                      select coalesce(jsonb_agg(distinct s.v), '[]'::jsonb)
                        from (select case when y = p_source::text then p_target::text else y end as v
                                from jsonb_array_elements_text(e.l -> 'tagIds') y) s
                       where s.v is not null))
                    else e.l end order by e.n)
                    from jsonb_array_elements(x.lines) with ordinality e(l, n)),
         field_versions = app._bump_version(x.field_versions, 'amountMinor', p_hlc)
   where x.user_id = p_user
     and exists (select 1 from jsonb_array_elements(x.lines) l where l -> 'tagIds' ? p_source::text);
  return v_a + v_b;
end;
$$;

revoke execute on function app._repoint_category(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function app._repoint_payee(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function app._repoint_tag(uuid, uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- pull
-- As 20261102000002_data_resets.sql, with plan items and item months.
create or replace function app.pull_changes(p_cursor bigint, p_limit int default 500)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 500), 1), 500);
  v_total int;
  v_cursor bigint;
  v_rows  jsonb;
begin
  if v_user is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  if p_cursor is null or p_cursor < 0 then
    raise exception 'VALIDATION_FAILED';
  end if;
  -- R5: the data this cursor was built on was reset — the device wipes its copy and starts from 0.
  if p_cursor > 0 and p_cursor < app._my_reset_seq() then
    return jsonb_build_object('cursor', '0', 'hasMore', true, 'reset', true, 'rows', jsonb_build_object(
      'account', '[]'::jsonb, 'account_group', '[]'::jsonb, 'category', '[]'::jsonb, 'tag', '[]'::jsonb,
      'payee', '[]'::jsonb, 'transaction', '[]'::jsonb, 'person_rate', '[]'::jsonb,
      'plan_item', '[]'::jsonb, 'plan_occurrence', '[]'::jsonb, 'template', '[]'::jsonb));
  end if;

  with changed as (
    select u.entity, u.server_seq, u.row
      from (select 'account'::text as entity, a.server_seq, to_jsonb(a) as row
              from public.accounts a where a.user_id = v_user and a.server_seq > p_cursor
            union all
            select 'account_group', g.server_seq, to_jsonb(g)
              from public.account_groups g where g.user_id = v_user and g.server_seq > p_cursor
            union all
            select 'category', c.server_seq, to_jsonb(c)
              from public.categories c where c.user_id = v_user and c.server_seq > p_cursor
            union all
            select 'tag', t.server_seq, to_jsonb(t)
              from public.tags t where t.user_id = v_user and t.server_seq > p_cursor
            union all
            select 'payee', p.server_seq, to_jsonb(p)
              from public.payees p where p.user_id = v_user and p.server_seq > p_cursor
            union all
            select 'transaction', t.server_seq, to_jsonb(t)
              from public.transactions t where t.user_id = v_user and t.server_seq > p_cursor
            union all
            select 'person_rate', r.server_seq, to_jsonb(r)
              from public.person_rates r where r.user_id = v_user and r.server_seq > p_cursor
            union all
            select 'plan_item', i.server_seq, to_jsonb(i)
              from public.plan_items i where i.user_id = v_user and i.server_seq > p_cursor
            union all
            select 'plan_occurrence', o.server_seq, to_jsonb(o)
              from public.plan_occurrences o where o.user_id = v_user and o.server_seq > p_cursor
            union all
            select 'template', x.server_seq, to_jsonb(x)
              from public.transaction_templates x where x.user_id = v_user and x.server_seq > p_cursor) u
     order by u.server_seq
     limit v_limit + 1
  ), page as (
    select c.*, row_number() over (order by c.server_seq) as rn from changed c
  )
  select count(*)::int,
         max(p.server_seq) filter (where p.rn <= v_limit),
         jsonb_build_object(
           'account', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'account' and p.rn <= v_limit), '[]'::jsonb),
           'account_group', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'account_group' and p.rn <= v_limit), '[]'::jsonb),
           'category', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'category' and p.rn <= v_limit), '[]'::jsonb),
           'tag', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'tag' and p.rn <= v_limit), '[]'::jsonb),
           'payee', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'payee' and p.rn <= v_limit), '[]'::jsonb),
           'transaction', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'transaction' and p.rn <= v_limit), '[]'::jsonb),
           'person_rate', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'person_rate' and p.rn <= v_limit), '[]'::jsonb),
           'plan_item', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'plan_item' and p.rn <= v_limit), '[]'::jsonb),
           'plan_occurrence', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'plan_occurrence' and p.rn <= v_limit), '[]'::jsonb),
           'template', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'template' and p.rn <= v_limit), '[]'::jsonb))
    into v_total, v_cursor, v_rows
    from page p;

  return jsonb_build_object('cursor', coalesce(v_cursor, p_cursor)::text, 'hasMore', v_total > v_limit, 'rows', v_rows);
end;
$$;

revoke execute on function app.pull_changes(bigint, int) from public, anon;
grant execute on function app.pull_changes(bigint, int) to authenticated;

-- ---------------------------------------------------------------- reset
-- As 20261102000003_data_reset.sql, with the plan and its "Plan checked" month (the reminder setting is kept).
create or replace function app._reset_user_data(p_user uuid, p_device text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed jsonb;
  v_n       integer;
begin
  if p_device is null or p_device not in ('web', 'android') then
    raise exception 'VALIDATION_FAILED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sync:' || p_user::text, 0));

  -- Children first: transactions (postings cascade) use plan items; plan items and rates use accounts,
  -- payees and categories.
  delete from public.transactions t where t.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := jsonb_build_object('transactions', v_n);
  -- Templates use accounts, payees, categories and plan items.
  delete from public.transaction_templates x where x.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('templates', v_n);
  delete from public.plan_occurrences o where o.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('planMonths', v_n);
  delete from public.plan_items i where i.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('planItems', v_n);
  delete from public.person_rates r where r.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('rates', v_n);
  delete from public.payees y where y.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('payees', v_n);
  delete from public.tags t where t.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('tags', v_n);
  delete from public.categories c where c.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('categories', v_n);
  delete from public.accounts a where a.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('accounts', v_n);
  delete from public.account_groups g where g.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('groups', v_n);

  -- Their history, as the R4 erasure does; and the replay memory of their changes.
  delete from public.audit_events e
   where e.target_type in ('account', 'account_group', 'category', 'tag', 'payee', 'transaction', 'person_rate',
                           'plan_item', 'plan_month', 'template')
     and e.details ->> 'ownerId' = p_user::text;
  delete from private.applied_changes c where c.user_id = p_user;

  update public.user_preferences p set categories_start = null, plan_checked_month = null where p.user_id = p_user;
  -- The reset point (research R5-03): older cursors start over; older changes are refused.
  insert into private.data_resets (user_id, reset_at, reset_seq)
  values (p_user, now(), nextval('sync.seq'))
  on conflict (user_id) do update set reset_at = excluded.reset_at, reset_seq = excluded.reset_seq;

  perform app.write_audit('data_reset'::public.audit_action, auth.uid(), null, 'user', p_user, null, p_device,
                          jsonb_build_object('ownerId', p_user));
  return v_removed;
end;
$$;

revoke execute on function app._reset_user_data(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- demo load: only into empty data
-- As 20261102000004_data_load.sql, with the plan tables in the "empty" rule.
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
     or exists (select 1 from public.person_rates where user_id = p_user)
     or exists (select 1 from public.plan_items where user_id = p_user)
     or exists (select 1 from public.plan_occurrences where user_id = p_user)
     or exists (select 1 from public.transaction_templates where user_id = p_user) then
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

revoke execute on function app._load_demo(uuid, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- erasure
-- As 20261101000006_tx_pull_erasure.sql: the erased user's plan history is deleted too.
create or replace function app.scrub_user_from_audit(p_user uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(p_email);
  v_ref text := 'erased:' || gen_random_uuid()::text;
  v_digest text := encode(extensions.digest(lower(p_email), 'sha256'), 'hex');
begin
  if exists (select 1 from public.profiles where user_id = p_user and role = 'owner') then
    raise exception 'CANNOT_TARGET_OWNER';
  end if;

  delete from public.audit_events
   where target_type in ('account', 'account_group', 'category', 'tag', 'payee', 'transaction', 'person_rate',
                         'plan_item', 'plan_month', 'template')
     and details ->> 'ownerId' = p_user::text;

  update public.audit_events
     set actor_id  = case when actor_id = p_user then null else actor_id end,
         target_id = case when target_id = p_user then null else target_id end,
         actor_ref = case when actor_id = p_user or lower(actor_ref) = v_email then v_ref else actor_ref end,
         target_ref = case when target_id = p_user or lower(target_ref) = v_email then v_ref else target_ref end,
         details   = details - 'emailRef'
   where actor_id = p_user or target_id = p_user
      or lower(actor_ref) = v_email or lower(target_ref) = v_email
      or details ->> 'emailRef' = v_digest;

  delete from public.invitations where email = v_email;
  delete from private.sign_in_attempts where email = v_email;
  delete from private.rate_limits where bucket = 'reset:' || v_digest;
  return v_ref;
end;
$$;
