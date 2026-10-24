-- T018 Server-only tables (never reachable by anon/authenticated).

-- FR-009: per-email failed password attempts.
create table private.sign_in_attempts (
  email           extensions.citext primary key,
  failed_count    integer not null default 0 check (failed_count >= 0),
  first_failed_at timestamptz,
  locked_until    timestamptz
);

-- FR-008a: fixed-window counters keyed by SHA-256 of email / client address (no raw values).
create table private.rate_limits (
  bucket       text primary key check (bucket ~ '^[a-z-]+:[0-9a-f]{64}$'),
  window_start timestamptz not null,
  count        integer not null check (count >= 0)
);

-- FR-019a: which environment this database belongs to; exactly one row.
create table private.environment (
  id   smallint primary key default 1 check (id = 1),
  name text not null check (name in ('demo', 'live'))
);

revoke all on all tables in schema private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema private to service_role;

-- Returns true when the request is allowed; false once `max_hits` is exceeded in the window.
create or replace function app.rate_limit_hit(p_bucket text, p_window_seconds integer, p_max_hits integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into private.rate_limits as r (bucket, window_start, count)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set count = case
                  when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1
                  else r.count + 1
                end,
        window_start = case
                  when r.window_start <= now() - make_interval(secs => p_window_seconds) then now()
                  else r.window_start
                end
  returning count into v_count;
  return v_count <= p_max_hits;
end;
$$;

revoke execute on function app.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function app.rate_limit_hit(text, integer, integer) to service_role;
