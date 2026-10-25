-- T027 Pull: the caller's synced rows changed since a cursor (contracts/sync-protocol.md §Pull).
-- SECURITY INVOKER — row-level security applies on top of the explicit user filter.

create or replace function app.pull_changes(p_cursor bigint, p_limit int default 500)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_limit    int := least(greatest(coalesce(p_limit, 500), 1), 500);
  v_total    int;
  v_cursor   bigint;
  v_accounts jsonb;
  v_groups   jsonb;
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
            select 'account_group'::text, g.server_seq, to_jsonb(g)
              from public.account_groups g where g.user_id = v_user and g.server_seq > p_cursor) u
     order by u.server_seq
     limit v_limit + 1
  ), page as (
    select c.*, row_number() over (order by c.server_seq) as rn from changed c
  )
  select count(*)::int,
         max(p.server_seq) filter (where p.rn <= v_limit),
         coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'account' and p.rn <= v_limit), '[]'::jsonb),
         coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'account_group' and p.rn <= v_limit), '[]'::jsonb)
    into v_total, v_cursor, v_accounts, v_groups
    from page p;

  return jsonb_build_object(
    'cursor', coalesce(v_cursor, p_cursor)::text,
    'hasMore', v_total > v_limit,
    'rows', jsonb_build_object('account', v_accounts, 'account_group', v_groups));
end;
$$;

revoke execute on function app.pull_changes(bigint, int) from public, anon;
grant execute on function app.pull_changes(bigint, int) to authenticated;
