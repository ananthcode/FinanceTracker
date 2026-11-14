-- R8 pgTAP helpers for quick-add templates. LOCAL database only.
begin;
select plan(1);

-- A template's fields; override any key with p_extra.
create or replace function tests.tpl_fields(p_name text, p_kind text, p_account uuid, p_amount text default '6000', p_extra jsonb default '{}')
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('name', p_name, 'kind', p_kind, 'accountId', p_account, 'amountMinor', p_amount, 'sortKey', 'a0') || p_extra;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select pass('template test helpers installed');
select * from finish();
commit;
