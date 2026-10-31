-- T039 Automatic interest proposals (R4 FR-013 – FR-014, research R4-05). The SQL twin of
-- packages/core proposeInterest; both run packages/core/test/vectors/interest.json (parity test).
--
-- REVIEW (constitution workflow — RLS, money): app.propose_interest() is SECURITY DEFINER, scoped to
-- auth.uid(), and decides "today" itself in the user's timezone (a caller cannot ask for months that
-- have not ended). The worker app._propose_interest(user, today) is for service_role only (parity
-- tests). It takes the same per-user advisory lock as sync.stamp_row, and the unique index
-- transactions_interest_once makes a month's proposal exist at most once, in any state, so a deleted
-- one is never recreated even by two calls at once.

-- rate × opening, rounded half away from zero to the paisa (numeric: exact; round() on numeric rounds
-- half away from zero). Keeps the opening's sign.
create or replace function app._interest_amount(p_opening bigint, p_rate_e4 integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select round(p_opening::numeric * p_rate_e4 / 1000000)::bigint;
$$;

create or replace function app._propose_interest(p_user uuid, p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_versions constant text[] := array['date', 'timeOfDay', 'accountId', 'toAccountId', 'amountMinor', 'payeeId',
                                      'personAction', 'flow', 'categoryId', 'tagIds', 'notes', 'reference', 'status',
                                      'confirmed', 'state'];
  v_person  public.payees%rowtype;
  r         public.transactions%rowtype;
  v_last    date := (date_trunc('month', p_today) - interval '1 month')::date;
  v_month   date;
  v_rate    integer;
  v_balance bigint;
  v_amount  bigint;
  v_flow    public.money_flow;
  v_hlc     text;
  v_versions jsonb;
  v_changed integer := 0;
  v_field   text;
begin
  perform pg_advisory_xact_lock(hashtextextended('sync:' || p_user::text, 0));
  v_hlc := lpad(floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text, 13, '0') || '.0000.server00';
  perform set_config('app.change_context', jsonb_build_object('hlc', v_hlc, 'clamped', false)::text, true);
  v_versions := '{}'::jsonb;
  foreach v_field in array c_versions loop
    v_versions := v_versions || jsonb_build_object(v_field, v_hlc);
  end loop;

  for v_person in
    select * from public.payees p
     where p.user_id = p_user and p.kind = 'person' and p.state = 'active' and p.interest_mode = 'automatic'
       and p.opening_balance_date is not null
       and exists (select 1 from public.person_rates x where x.payee_id = p.id and x.user_id = p_user and x.state <> 'deleted')
     order by p.id
  loop
    -- The first month starting on or after the opening date.
    v_month := case when extract(day from v_person.opening_balance_date) = 1 then v_person.opening_balance_date
                    else (date_trunc('month', v_person.opening_balance_date) + interval '1 month')::date end;
    while v_month <= v_last loop
      select x.rate_e4 into v_rate from public.person_rates x
       where x.payee_id = v_person.id and x.user_id = p_user and x.state <> 'deleted' and x.effective_month <= v_month
       order by x.effective_month desc limit 1;
      if found then
        -- The balance at the start of the month: counted movements (confirmed proposals included) and
        -- earlier proposals still waiting, with their current amounts.
        v_balance := v_person.opening_balance_minor
          + coalesce((select sum(x.effect) from private.transaction_postings x
                       where x.user_id = p_user and x.posting_type = 'person' and x.person_id = v_person.id and x.counted
                         and x.date >= v_person.opening_balance_date and x.date < v_month), 0)
          + coalesce((select sum(case when t.flow = 'out' then t.amount_minor else -t.amount_minor end)
                        from public.transactions t
                       where t.user_id = p_user and t.payee_id = v_person.id and t.generated and t.state = 'active'
                         and not t.confirmed and t.status <> 'void' and t.interest_month < v_month), 0);
        v_amount := app._interest_amount(v_balance, v_rate);
        v_flow := case when v_amount < 0 then 'in'::public.money_flow else 'out'::public.money_flow end;

        select * into r from public.transactions t
         where t.user_id = p_user and t.payee_id = v_person.id and t.generated and t.interest_month = v_month;
        if not found then
          if v_amount <> 0 then
            insert into public.transactions (id, user_id, date, kind, flow, amount_minor, payee_id, confirmed, generated,
                                             interest_month, field_versions)
            values (gen_random_uuid(), p_user, (v_month + interval '1 month' - interval '1 day')::date, 'interest', v_flow,
                    abs(v_amount), v_person.id, false, true, v_month, v_versions);
            v_changed := v_changed + 1;
          end if;
        elsif r.state = 'active' and not r.confirmed and not r.user_edited and r.status <> 'void' then
          -- A waiting, unedited proposal follows the balance; at ₹0.00 it is withdrawn.
          if v_amount = 0 then
            update public.transactions t set state = 'deleted', deleted_at = now(),
                   field_versions = app._bump_version(t.field_versions, 'state', v_hlc)
             where t.id = r.id;
            v_changed := v_changed + 1;
          elsif (case when r.flow = 'out' then r.amount_minor else -r.amount_minor end) <> v_amount then
            update public.transactions t set amount_minor = abs(v_amount), flow = v_flow,
                   field_versions = app._bump_version(app._bump_version(t.field_versions, 'amountMinor', v_hlc), 'flow', v_hlc)
             where t.id = r.id;
            v_changed := v_changed + 1;
          end if;
        end if;
      end if;
      v_month := (v_month + interval '1 month')::date;
    end loop;
  end loop;
  return v_changed;
end;
$$;

-- Called by the web app once per signed-in page load (POST /api/interest/propose) and by Android.
create or replace function app.propose_interest()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tz   text;
begin
  if v_user is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  select p.timezone into v_tz from public.user_preferences p where p.user_id = v_user;
  return jsonb_build_object('changed',
    app._propose_interest(v_user, (now() at time zone coalesce(v_tz, 'Asia/Kolkata'))::date));
end;
$$;

revoke execute on function app._interest_amount(bigint, integer) from public, anon, authenticated;
revoke execute on function app._propose_interest(uuid, date) from public, anon, authenticated;
grant execute on function app._interest_amount(bigint, integer) to service_role;
grant execute on function app._propose_interest(uuid, date) to service_role;
revoke execute on function app.propose_interest() from public, anon;
grant execute on function app.propose_interest() to authenticated;
