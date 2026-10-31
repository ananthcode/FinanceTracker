-- T012 Derived postings (research R4-02, R4-03). The SQL twin of postingsOf() in
-- packages/core/src/transactions/postings.ts; both run vectors/transactions.json (parity test).
--
-- REVIEW (money): every balance and total reads these rows.
--   Account effect: held accounts + for money in, − for money out; owed accounts (credit cards) the
--   opposite. Person effect: + when the person owes the user more (flow out), − otherwise.
--   Category effect: expense lines +, refund lines −, income lines +; null category = Uncategorised.
--   Counted = active, confirmed and not void.

create or replace function app._rebuild_postings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counted boolean := new.state = 'active' and new.confirmed and new.status <> 'void';
  v_kind    public.category_kind := case when new.kind = 'income' then 'income' else 'expense' end::public.category_kind;
  v_sign    bigint := case when new.kind = 'refund' then -1 else 1 end;
  v_line    jsonb;
  v_no      integer;
begin
  delete from private.transaction_postings p where p.transaction_id = new.id;

  if new.account_id is not null then
    insert into private.transaction_postings (transaction_id, line_no, user_id, date, counted, posting_type, account_id, effect)
    select new.id, 0, new.user_id, new.date, v_counted, 'account', new.account_id,
           (case when new.flow = 'in' then new.amount_minor else -new.amount_minor end)
           * (case when a.type = 'credit_card' then -1 else 1 end)
      from public.accounts a where a.id = new.account_id;
  end if;

  if new.kind = 'transfer' then
    insert into private.transaction_postings (transaction_id, line_no, user_id, date, counted, posting_type, account_id, effect)
    select new.id, 0, new.user_id, new.date, v_counted, 'account', new.to_account_id,
           new.amount_minor * (case when a.type = 'credit_card' then -1 else 1 end)
      from public.accounts a where a.id = new.to_account_id;
  elsif new.kind in ('person', 'interest') then
    insert into private.transaction_postings (transaction_id, line_no, user_id, date, counted, posting_type, person_id, effect)
    values (new.id, 0, new.user_id, new.date, v_counted, 'person', new.payee_id,
            case when new.flow = 'out' then new.amount_minor else -new.amount_minor end);
  elsif jsonb_array_length(new.lines) = 0 then
    insert into private.transaction_postings (transaction_id, line_no, user_id, date, counted, posting_type, category_id, category_kind, effect)
    values (new.id, 0, new.user_id, new.date, v_counted, 'category', new.category_id, v_kind, v_sign * new.amount_minor);
  else
    for v_line, v_no in select e.value, e.ordinality from jsonb_array_elements(new.lines) with ordinality e loop
      if v_line ->> 'personId' is not null then
        insert into private.transaction_postings (transaction_id, line_no, user_id, date, counted, posting_type, person_id, effect)
        values (new.id, v_no, new.user_id, new.date, v_counted, 'person', (v_line ->> 'personId')::uuid,
                case when new.flow = 'out' then (v_line ->> 'amountMinor')::bigint else -(v_line ->> 'amountMinor')::bigint end);
      else
        insert into private.transaction_postings (transaction_id, line_no, user_id, date, counted, posting_type, category_id, category_kind, effect)
        values (new.id, v_no, new.user_id, new.date, v_counted, 'category', (v_line ->> 'categoryId')::uuid, v_kind,
                v_sign * (v_line ->> 'amountMinor')::bigint);
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create trigger transactions_rebuild_postings after insert or update on public.transactions
  for each row execute function app._rebuild_postings();

revoke execute on function app._rebuild_postings() from public, anon, authenticated;
