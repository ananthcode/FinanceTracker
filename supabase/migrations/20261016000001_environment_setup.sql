-- T044 Environment setup: records which environment this database is (FR-019a). Service role only;
-- used by scripts/env-bootstrap.ts. The name can be set once and never changed.

create or replace function app.set_environment(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if p_name not in ('demo', 'live') then
    raise exception 'INVALID_ENVIRONMENT' using errcode = '22023';
  end if;
  select e.name into v_current from private.environment e where e.id = 1;
  if v_current is null then
    insert into private.environment (id, name) values (1, p_name);
    return p_name;
  end if;
  if v_current <> p_name then
    raise exception 'ENVIRONMENT_MISMATCH' using errcode = '42501',
      detail = 'This database already belongs to another environment';
  end if;
  return v_current;
end;
$$;

revoke execute on function app.set_environment(text) from public, anon, authenticated;
grant execute on function app.set_environment(text) to service_role;
