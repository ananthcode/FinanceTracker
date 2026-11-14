-- T013 Pull, reset, demo load, erasure and search learn attachments and warranties
-- (specs/009-attachments-warranty research R9-03, R9-07). Each function is the R8 one
-- (20261114000004_tpl_repoint_pull_reset.sql) or the R6 search (20261103000002_rpt_readers.sql) with R9 added.
--
-- REVIEW (constitution workflow — RLS / sync / erasure): pull returns the caller's attachment records;
-- reset and erasure delete the records and their history (the files are removed by the server route with
-- the service role); the search stays INVOKER and gains a `warranty` filter and an attachment count.

-- ---------------------------------------------------------------- pull
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
      'plan_item', '[]'::jsonb, 'plan_occurrence', '[]'::jsonb, 'template', '[]'::jsonb,
      'attachment', '[]'::jsonb));
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
              from public.transaction_templates x where x.user_id = v_user and x.server_seq > p_cursor
            union all
            select 'attachment', a.server_seq, to_jsonb(a)
              from public.attachments a where a.user_id = v_user and a.server_seq > p_cursor) u
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
           'template', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'template' and p.rn <= v_limit), '[]'::jsonb),
           'attachment', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'attachment' and p.rn <= v_limit), '[]'::jsonb))
    into v_total, v_cursor, v_rows
    from page p;

  return jsonb_build_object('cursor', coalesce(v_cursor, p_cursor)::text, 'hasMore', v_total > v_limit, 'rows', v_rows);
end;
$$;

revoke execute on function app.pull_changes(bigint, int) from public, anon;
grant execute on function app.pull_changes(bigint, int) to authenticated;

-- ---------------------------------------------------------------- reset
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
  -- R9: attachment records first (their files are removed by the server route, research R9-03).
  delete from public.attachments a where a.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := jsonb_build_object('attachments', v_n);
  delete from public.transactions t where t.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('transactions', v_n);
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
                           'plan_item', 'plan_month', 'template', 'attachment')
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
     or exists (select 1 from public.transaction_templates where user_id = p_user)
     or exists (select 1 from public.attachments where user_id = p_user) then
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
                         'plan_item', 'plan_month', 'template', 'attachment')
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

-- ---------------------------------------------------------------- search
create or replace function app.search_transactions(p_filters jsonb default '{}'::jsonb, p_after jsonb default null,
                                                   p_limit int default 50)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_f     jsonb := coalesce(p_filters, '{}'::jsonb);
  v_text  text := nullif(btrim(v_f ->> 'text'), '');
  v_cats  uuid[];
  v_rows  jsonb;
  v_count integer;
  v_total bigint;
  v_next  jsonb;
begin
  if v_user is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  if v_f ? 'categoryId' and v_f ->> 'categoryId' <> 'uncategorised' and coalesce((v_f ->> 'categoryExact')::boolean, false) then
    v_cats := array[(v_f ->> 'categoryId')::uuid]; -- R6: the category itself only
  elsif v_f ? 'categoryId' and v_f ->> 'categoryId' <> 'uncategorised' then
    with recursive tree(id) as (
      select (v_f ->> 'categoryId')::uuid
      union
      select c.id from public.categories c join tree on c.parent_id = tree.id where c.user_id = v_user
    )
    select array_agg(id) into v_cats from tree;
  end if;

  with match as materialized (
    select t.id, t.date, coalesce(t.time_of_day, time '00:00') as t, t.created_at, t.flow, t.kind, t.amount_minor as amount,
           t.confirmed and t.status <> 'void' as counted
      from public.transactions t
      left join public.payees p on p.id = t.payee_id
      left join public.categories c on c.id = t.category_id
     where t.user_id = v_user and t.state = 'active'
       and (v_f ->> 'from' is null or t.date >= (v_f ->> 'from')::date)
       and (v_f ->> 'to' is null or t.date <= (v_f ->> 'to')::date)
       and (v_f ->> 'accountId' is null or t.account_id = (v_f ->> 'accountId')::uuid or t.to_account_id = (v_f ->> 'accountId')::uuid)
       and (case when v_f ->> 'payeeId' is null then true
                 when v_f ->> 'payeeId' = 'none' then t.payee_id is null -- R6: "No payee"
                 else t.payee_id = (v_f ->> 'payeeId')::uuid
                      or exists (select 1 from jsonb_array_elements(t.lines) l where l ->> 'personId' = v_f ->> 'payeeId') end)
       and (v_f ->> 'tagId' is null or (v_f ->> 'tagId')::uuid = any(t.tag_ids)
            or exists (select 1 from jsonb_array_elements(t.lines) l where l -> 'tagIds' ? (v_f ->> 'tagId')))
       and (v_f -> 'kinds' is null or t.kind::text in (select jsonb_array_elements_text(v_f -> 'kinds')))
       and (v_f -> 'statuses' is null or t.status::text in (select jsonb_array_elements_text(v_f -> 'statuses')))
       and (v_f ->> 'minMinor' is null or t.amount_minor >= (v_f ->> 'minMinor')::bigint)
       and (v_f ->> 'maxMinor' is null or t.amount_minor <= (v_f ->> 'maxMinor')::bigint)
       and (v_f ->> 'upcoming' is null or t.confirmed = not (v_f ->> 'upcoming')::boolean)
       and (not coalesce((v_f ->> 'warranty')::boolean, false) or t.warranty_until is not null) -- R9-07
       and (v_f ->> 'categoryId' is null
            or (v_f ->> 'categoryId' = 'uncategorised' and t.kind in ('expense', 'income', 'refund')
                and t.category_id is null and jsonb_array_length(t.lines) = 0)
            or t.category_id = any(v_cats)
            or exists (select 1 from jsonb_array_elements(t.lines) l where (l ->> 'categoryId')::uuid = any(v_cats)))
       and (v_text is null
            or t.notes ilike '%' || v_text || '%' or t.reference ilike '%' || v_text || '%'
            or p.name ilike '%' || v_text || '%' or c.name ilike '%' || v_text || '%'
            or exists (select 1 from jsonb_array_elements(t.lines) l
                        join public.categories lc on lc.id = (l ->> 'categoryId')::uuid
                       where lc.name ilike '%' || v_text || '%'))
  ), page as (
    select m.* from match m
     where p_after is null
        or (m.date, m.t, m.created_at, m.id) < ((p_after ->> 'date')::date, (p_after ->> 'time')::time,
                                                 (p_after ->> 'createdAt')::timestamptz, (p_after ->> 'id')::uuid)
     order by m.date desc, m.t desc, m.created_at desc, m.id desc
     limit v_limit + 1
  ), numbered as (
    select page.*, row_number() over (order by page.date desc, page.t desc, page.created_at desc, page.id desc) as rn from page
  )
  select (select count(*)::int from match),
         (select coalesce(sum(case when m.kind = 'transfer' or not m.counted then 0
                                   when m.flow = 'in' then m.amount else -m.amount end), 0)::bigint from match m),
         (select coalesce(jsonb_agg(to_jsonb(x) - 'field_versions' - 'server_seq' - 'user_id'
                                      || jsonb_build_object('attachment_count',
                                           (select count(*) from public.attachments a
                                             where a.transaction_id = x.id and a.state = 'active'))
                                    order by n.rn)
                            filter (where n.rn <= v_limit), '[]'::jsonb)
            from numbered n join public.transactions x on x.id = n.id),
         (select jsonb_build_object('date', a.date, 'time', a.t, 'createdAt', a.created_at, 'id', a.id)
            from numbered a where a.rn = v_limit and exists (select 1 from numbered b where b.rn = v_limit + 1))
    into v_count, v_total, v_rows, v_next;

  return jsonb_build_object('rows', v_rows, 'count', v_count, 'totalMinor', v_total::text, 'next', v_next);
end;
$$;

revoke execute on function app.search_transactions(jsonb, jsonb, int) from public, anon;
grant execute on function app.search_transactions(jsonb, jsonb, int) to authenticated;
