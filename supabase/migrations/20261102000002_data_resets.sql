-- T005 The reset point (R5 research R5-03, FR-012). After a user resets their data, a device pulling
-- from an older cursor is told to start over, and a change made before the reset is refused.
--
-- REVIEW (constitution workflow — sync): private table, no client grants; read only through the two
-- functions below, for auth.uid() only.

create table private.data_resets (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  reset_at  timestamptz not null,
  reset_seq bigint not null
);

-- The caller's last reset (its server_seq), or 0. SECURITY DEFINER so the INVOKER pull can ask.
create or replace function app._my_reset_seq()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.reset_seq from private.data_resets r where r.user_id = auth.uid()), 0);
$$;

-- As 20261024000006_apply_changes.sql, refusing changes made before the user's last reset.
create or replace function app.apply_changes(p_changes jsonb, p_device text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_results  jsonb := '[]'::jsonb;
  v_change   jsonb;
  v_reset_ms bigint;
begin
  if v_user is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  if p_device is null or p_device not in ('web', 'android') then
    raise exception 'VALIDATION_FAILED';
  end if;
  -- Two checks: SQL does not promise short-circuit evaluation of OR.
  if jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'VALIDATION_FAILED';
  end if;
  if jsonb_array_length(p_changes) not between 1 and 100 then
    raise exception 'VALIDATION_FAILED';
  end if;
  select floor(extract(epoch from r.reset_at) * 1000)::bigint into v_reset_ms from private.data_resets r where r.user_id = v_user;

  perform set_config('app.device_type', p_device, true);
  for v_change in select e.value from jsonb_array_elements(p_changes) with ordinality e order by e.ordinality loop
    if v_reset_ms is not null and coalesce(v_change ->> 'hlc', '') ~ '^\d{13}\.'
       and split_part(v_change ->> 'hlc', '.', 1)::bigint < v_reset_ms then
      -- Made before the reset (R5): never applied, never remembered.
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'changeId', v_change ->> 'changeId', 'status', 'rejected', 'code', 'DATA_RESET',
        'appliedFields', '[]'::jsonb, 'ignoredFields', '[]'::jsonb, 'clamped', false));
    else
      v_results := v_results || jsonb_build_array(app._apply_one(v_user, v_change, now()));
    end if;
  end loop;
  perform set_config('app.change_context', '', true);
  perform set_config('app.device_type', '', true);
  return v_results;
end;
$$;

-- As 20261101000006_tx_pull_erasure.sql, answering `reset` for a cursor older than the last reset.
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
      'payee', '[]'::jsonb, 'transaction', '[]'::jsonb, 'person_rate', '[]'::jsonb));
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
              from public.person_rates r where r.user_id = v_user and r.server_seq > p_cursor) u
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
           'person_rate', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'person_rate' and p.rn <= v_limit), '[]'::jsonb))
    into v_total, v_cursor, v_rows
    from page p;

  return jsonb_build_object('cursor', coalesce(v_cursor, p_cursor)::text, 'hasMore', v_total > v_limit, 'rows', v_rows);
end;
$$;

revoke execute on function app._my_reset_seq() from public, anon;
grant execute on function app._my_reset_seq() to authenticated;
revoke execute on function app.pull_changes(bigint, int) from public, anon;
grant execute on function app.pull_changes(bigint, int) to authenticated;
