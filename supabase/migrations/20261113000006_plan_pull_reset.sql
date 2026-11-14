-- T014 Pull, reset, demo load and erasure learn the plan (contracts/sync-protocol.md §Pull; research R7-12).
--
-- REVIEW (constitution workflow — RLS / sync / erasure): pull stays SECURITY INVOKER (RLS select-own).
-- Reset and demo load stay SECURITY DEFINER for auth.uid() only; every statement filters on the
-- caller's user_id. Erasure deletes the erased user's plan history; their rows go by cascade.

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
      'plan_item', '[]'::jsonb, 'plan_occurrence', '[]'::jsonb));
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
              from public.plan_occurrences o where o.user_id = v_user and o.server_seq > p_cursor) u
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
           'plan_occurrence', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'plan_occurrence' and p.rn <= v_limit), '[]'::jsonb))
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
                           'plan_item', 'plan_month')
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
     or exists (select 1 from public.plan_occurrences where user_id = p_user) then
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
                         'plan_item', 'plan_month')
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
