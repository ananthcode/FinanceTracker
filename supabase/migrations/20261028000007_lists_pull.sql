-- T014 Pull also returns categories, tags and payees (R3 contracts/sync-protocol.md §Pull).
-- As 20261024000007_pull_changes.sql with three more entities. SECURITY INVOKER.

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
              from public.payees p where p.user_id = v_user and p.server_seq > p_cursor) u
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
           'payee', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'payee' and p.rn <= v_limit), '[]'::jsonb))
    into v_total, v_cursor, v_rows
    from page p;

  return jsonb_build_object('cursor', coalesce(v_cursor, p_cursor)::text, 'hasMore', v_total > v_limit, 'rows', v_rows);
end;
$$;

revoke execute on function app.pull_changes(bigint, int) from public, anon;
grant execute on function app.pull_changes(bigint, int) to authenticated;
