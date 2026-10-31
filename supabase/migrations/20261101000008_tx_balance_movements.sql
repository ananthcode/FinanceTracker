-- T027 Every balance on a screen in one read (R4 FR-007, FR-008): the sum of each account's and each
-- person's counted postings on or after their opening date, as text (exact). Screens add these to the
-- opening balances with core currentBalance / personBalance, so the numbers equal
-- app.account_balance_minor / app.person_balance_minor (the parity test checks those against core).
-- SECURITY DEFINER because postings are private; it reads only the caller's own rows.
create or replace function app.balance_movements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  return jsonb_build_object(
    'accounts', (select coalesce(jsonb_object_agg(x.id, x.total::text), '{}'::jsonb) from (
                   select a.id, sum(p.effect) as total
                     from public.accounts a
                     join private.transaction_postings p
                       on p.posting_type = 'account' and p.account_id = a.id and p.counted and p.date >= a.opening_balance_date
                    where a.user_id = v_user and p.user_id = v_user
                    group by a.id) x),
    'people', (select coalesce(jsonb_object_agg(x.id, x.total::text), '{}'::jsonb) from (
                 select y.id, sum(p.effect) as total
                   from public.payees y
                   join private.transaction_postings p
                     on p.posting_type = 'person' and p.person_id = y.id and p.counted
                    and (y.opening_balance_date is null or p.date >= y.opening_balance_date)
                  where y.user_id = v_user and p.user_id = v_user
                  group by y.id) x));
end;
$$;

revoke execute on function app.balance_movements() from public, anon;
grant execute on function app.balance_movements() to authenticated;
