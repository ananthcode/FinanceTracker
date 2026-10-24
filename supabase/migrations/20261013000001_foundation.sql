-- T013 Foundation: extensions and schemas (data-model.md §Conventions).
--   public  — API-exposed tables
--   app     — helper/RPC functions (EXECUTE granted explicitly per function)
--   audit   — trigger functions for change history
--   private — server-only tables, never exposed to client roles

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
create schema if not exists audit;
create schema if not exists private;

-- Client roles may resolve names in app (to call the few functions granted to them) but
-- never touch audit/private directly.
grant usage on schema app to anon, authenticated, service_role;
revoke all on schema audit from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;
grant usage on schema audit to service_role;
grant usage on schema private to service_role;

-- Functions are not executable by default; each RPC is granted explicitly.
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema audit revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- updated_at helper used by several tables.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
