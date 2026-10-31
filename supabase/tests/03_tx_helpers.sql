-- R4 pgTAP helpers for transactions. LOCAL database only.
begin;
select plan(1);

-- Transaction fields; override any key with p_extra.
create or replace function tests.tx_fields(p_kind text, p_account uuid, p_amount text, p_extra jsonb default '{}')
returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(jsonb_build_object('kind', p_kind, 'date', '2026-10-05', 'accountId', p_account,
                                              'amountMinor', p_amount)) || p_extra;
$$;

-- A user with a bank (₹1,00,000.00), a credit card (₹18,250.00 owed) and cash (₹2,000.00), all opened
-- 2026-04-01; categories Groceries, Eating out (expense) and Salary (income); a business and a person.
-- Returns their ids as jsonb.
create or replace function tests.tx_world(p_user uuid)
returns jsonb
language plpgsql
as $$
declare
  w jsonb := jsonb_build_object('bank', gen_random_uuid(), 'card', gen_random_uuid(), 'cash', gen_random_uuid(),
                                'groceries', gen_random_uuid(), 'eating', gen_random_uuid(), 'salary', gen_random_uuid(),
                                'shop', gen_random_uuid(), 'ravi', gen_random_uuid(), 'meera', gen_random_uuid(),
                                'tag', gen_random_uuid());
begin
  perform tests.authenticate_as(p_user);
  perform tests.apply1(tests.lchange('account', (w ->> 'bank')::uuid, 'create', tests.account_fields('Bank', 'bank', '10000000')));
  perform tests.apply1(tests.lchange('account', (w ->> 'card')::uuid, 'create',
                       tests.account_fields('Card', 'credit_card', '1825000', '{"icon":"credit-card"}')));
  perform tests.apply1(tests.lchange('account', (w ->> 'cash')::uuid, 'create', tests.account_fields('Cash', 'cash', '200000')));
  perform tests.apply1(tests.lchange('category', (w ->> 'groceries')::uuid, 'create', tests.category_fields('Groceries')));
  perform tests.apply1(tests.lchange('category', (w ->> 'eating')::uuid, 'create', tests.category_fields('Eating out')));
  perform tests.apply1(tests.lchange('category', (w ->> 'salary')::uuid, 'create', tests.category_fields('Salary', 'income')));
  perform tests.apply1(tests.lchange('payee', (w ->> 'shop')::uuid, 'create', tests.business_fields('Fresh Mart')));
  perform tests.apply1(tests.lchange('payee', (w ->> 'ravi')::uuid, 'create', tests.person_fields('Ravi', '1500000')));
  perform tests.apply1(tests.lchange('payee', (w ->> 'meera')::uuid, 'create', tests.person_fields('Meera', '-450000')));
  perform tests.apply1(tests.lchange('tag', (w ->> 'tag')::uuid, 'create', '{"name":"Diwali"}'));
  return w;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select pass('transaction test helpers installed');
select * from finish();
commit;
