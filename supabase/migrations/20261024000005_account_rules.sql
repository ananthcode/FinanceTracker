-- T025 Server-side balance and activity rules (research R2-07, R2-13).

-- Current balance in minor units: opening balance plus movements on or after the opening date.
-- Mirrors currentBalance() in packages/core/src/accounts/balance.ts (same test vectors).
-- R4 adds the transaction movements here.
create or replace function app.account_balance_minor(p_account uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select a.opening_balance_minor
    from public.accounts a
   where a.id = p_account;
$$;

-- Whether any transaction has ever referenced the account (FR-024). No transactions exist before
-- R4, which replaces this body.
create or replace function app.account_has_activity(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

revoke execute on function app.account_balance_minor(uuid) from public, anon, authenticated;
revoke execute on function app.account_has_activity(uuid) from public, anon, authenticated;
grant execute on function app.account_balance_minor(uuid) to service_role;
