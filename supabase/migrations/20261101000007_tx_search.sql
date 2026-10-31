-- T047 (built with US1, which lists transactions) Search and the "To confirm" count
-- (R4 research R4-08, FR-017, FR-002a). Both are SECURITY INVOKER: row-level security applies on top
-- of the explicit user filter.

-- Filters (all optional): text, from, to (yyyy-MM-dd), accountId, categoryId (with its sub-categories)
-- or "uncategorised", payeeId, tagId, kinds[], statuses[], minMinor, maxMinor (strings of paise),
-- upcoming (true: only unconfirmed, false: only confirmed).
-- Keyset paging: p_after = { date, time, createdAt, id } of the last row shown; newest first.
-- Returns { rows, count, totalMinor, next }: totalMinor is money in minus money out of the matches
-- that count (confirmed, not void), transfers excluded.
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
  if v_f ? 'categoryId' and v_f ->> 'categoryId' <> 'uncategorised' then
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
       and (v_f ->> 'payeeId' is null or t.payee_id = (v_f ->> 'payeeId')::uuid
            or exists (select 1 from jsonb_array_elements(t.lines) l where l ->> 'personId' = v_f ->> 'payeeId'))
       and (v_f ->> 'tagId' is null or (v_f ->> 'tagId')::uuid = any(t.tag_ids)
            or exists (select 1 from jsonb_array_elements(t.lines) l where l -> 'tagIds' ? (v_f ->> 'tagId')))
       and (v_f -> 'kinds' is null or t.kind::text in (select jsonb_array_elements_text(v_f -> 'kinds')))
       and (v_f -> 'statuses' is null or t.status::text in (select jsonb_array_elements_text(v_f -> 'statuses')))
       and (v_f ->> 'minMinor' is null or t.amount_minor >= (v_f ->> 'minMinor')::bigint)
       and (v_f ->> 'maxMinor' is null or t.amount_minor <= (v_f ->> 'maxMinor')::bigint)
       and (v_f ->> 'upcoming' is null or t.confirmed = not (v_f ->> 'upcoming')::boolean)
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
         (select coalesce(jsonb_agg(to_jsonb(x) - 'field_versions' - 'server_seq' - 'user_id' order by n.rn)
                            filter (where n.rn <= v_limit), '[]'::jsonb)
            from numbered n join public.transactions x on x.id = n.id),
         (select jsonb_build_object('date', a.date, 'time', a.t, 'createdAt', a.created_at, 'id', a.id)
            from numbered a where a.rn = v_limit and exists (select 1 from numbered b where b.rn = v_limit + 1))
    into v_count, v_total, v_rows, v_next;

  return jsonb_build_object('rows', v_rows, 'count', v_count, 'totalMinor', v_total::text, 'next', v_next);
end;
$$;

-- Transactions waiting for the user's confirmation now: due upcoming ones and interest proposals.
create or replace function app.to_confirm_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
    from public.transactions t
   where t.user_id = auth.uid() and t.state = 'active' and not t.confirmed and t.status <> 'void'
     and t.date <= (now() at time zone coalesce((select p.timezone from public.user_preferences p where p.user_id = auth.uid()), 'Asia/Kolkata'))::date;
$$;

revoke execute on function app.search_transactions(jsonb, jsonb, int) from public, anon;
revoke execute on function app.to_confirm_count() from public, anon;
grant execute on function app.search_transactions(jsonb, jsonb, int) to authenticated;
grant execute on function app.to_confirm_count() to authenticated;
