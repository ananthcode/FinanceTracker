-- T013 Balances and activity now read transactions (research R4-07); the R2/R3 placeholders are
-- replaced here, as their review notes required.

-- Opening balance plus counted account postings on or after the opening date (R2 FR-012).
-- Mirrors currentBalance(account, movementsOf(...)) in packages/core.
create or replace function app.account_balance_minor(p_account uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select a.opening_balance_minor + coalesce((
           select sum(p.effect) from private.transaction_postings p
            where p.posting_type = 'account' and p.account_id = a.id and p.counted
              and p.date >= a.opening_balance_date), 0)::bigint
    from public.accounts a
   where a.id = p_account;
$$;

-- Opening balance plus counted person postings on or after the opening date (R3 FR-017).
create or replace function app.person_balance_minor(p_payee uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select p.opening_balance_minor + coalesce((
           select sum(x.effect) from private.transaction_postings x
            where x.posting_type = 'person' and x.person_id = p.id and x.counted
              and (p.opening_balance_date is null or x.date >= p.opening_balance_date)), 0)::bigint
    from public.payees p
   where p.id = p_payee;
$$;

-- "Has ever been used": any transaction row, deleted ones included (R2 FR-024, R3 FR-025, R4 FR-021).
create or replace function app.account_has_activity(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.transactions t where t.account_id = p_account or t.to_account_id = p_account);
$$;

create or replace function app.category_has_activity(p_category uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.transaction_postings p where p.posting_type = 'category' and p.category_id = p_category);
$$;

create or replace function app.payee_has_activity(p_payee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.transactions t where t.payee_id = p_payee)
      or exists (select 1 from private.transaction_postings p where p.posting_type = 'person' and p.person_id = p_payee);
$$;

-- How many active transactions carry the tag, on the transaction or on a split line (FR-021).
create or replace function app.tag_usage_count(p_tag uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.transactions t
   where t.state = 'active'
     and (p_tag = any(t.tag_ids)
          or exists (select 1 from jsonb_array_elements(t.lines) l where l -> 'tagIds' ? p_tag::text));
$$;

-- ---------------------------------------------------------------- guards (clarify Q2, spec edge cases)
-- An opening date may not move after a transaction it would leave out of the balance.
create or replace function app._guard_account_opening_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.opening_balance_date > old.opening_balance_date and exists (
       select 1 from public.transactions t
        where (t.account_id = new.id or t.to_account_id = new.id) and t.state = 'active'
          and t.date < new.opening_balance_date) then
    raise exception 'DATE_BEFORE_OPENING';
  end if;
  return new;
end;
$$;

create trigger accounts_guard_opening_date before update of opening_balance_date on public.accounts
  for each row execute function app._guard_account_opening_date();

-- A person's opening date likewise; and a person with movements cannot become a business.
create or replace function app._guard_payee_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.kind = 'person' and new.kind = 'business'
     and exists (select 1 from private.transaction_postings p where p.posting_type = 'person' and p.person_id = new.id) then
    raise exception 'INVALID_PERSON';
  end if;
  if new.kind = 'person' and new.opening_balance_date is not null
     and (old.opening_balance_date is null or new.opening_balance_date > old.opening_balance_date)
     and exists (select 1 from private.transaction_postings p
                  where p.posting_type = 'person' and p.person_id = new.id and p.date < new.opening_balance_date
                    and exists (select 1 from public.transactions t where t.id = p.transaction_id and t.state = 'active')) then
    raise exception 'DATE_BEFORE_OPENING';
  end if;
  return new;
end;
$$;

create trigger payees_guard_person before update on public.payees
  for each row execute function app._guard_payee_person();

revoke execute on function app.account_has_activity(uuid) from public, anon, authenticated;
revoke execute on function app.category_has_activity(uuid) from public, anon, authenticated;
revoke execute on function app.payee_has_activity(uuid) from public, anon, authenticated;
revoke execute on function app.tag_usage_count(uuid) from public, anon, authenticated;
revoke execute on function app._guard_account_opening_date() from public, anon, authenticated;
revoke execute on function app._guard_payee_person() from public, anon, authenticated;
grant execute on function app.account_balance_minor(uuid) to service_role;
grant execute on function app.person_balance_minor(uuid) to service_role;
