-- T012 Server-side rules for categories, tags and payees (research R3-07, R3-10).

-- A person's current balance in paise: positive = they owe the user. Opening balance plus
-- person-ledger movements on or after the opening date; R4 adds the movements here.
-- Mirrors personBalance() in packages/core/src/people/balance.ts (vectors/people.json).
create or replace function app.person_balance_minor(p_payee uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select p.opening_balance_minor
    from public.payees p
   where p.id = p_payee;
$$;

-- Whether any record has ever referenced the category / payee (FR-025). No transactions exist
-- before R4, which replaces these bodies.
create or replace function app.category_has_activity(p_category uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

create or replace function app.payee_has_activity(p_payee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

-- How many records carry the tag (FR-010 confirmation). R4 replaces this body.
create or replace function app.tag_usage_count(p_tag uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 0;
$$;

revoke execute on function app.person_balance_minor(uuid) from public, anon, authenticated;
revoke execute on function app.category_has_activity(uuid) from public, anon, authenticated;
revoke execute on function app.payee_has_activity(uuid) from public, anon, authenticated;
revoke execute on function app.tag_usage_count(uuid) from public, anon, authenticated;
grant execute on function app.person_balance_minor(uuid) to service_role;
