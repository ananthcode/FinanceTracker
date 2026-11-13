-- R7 pgTAP helpers for the payment plan. LOCAL database only.
begin;
select plan(1);

-- The 1st of the current month in India plus p_offset months, as 'yyyy-MM-dd'.
create or replace function tests.month(p_offset int default 0)
returns text
language sql
stable
as $$
  select to_char((date_trunc('month', now() at time zone 'Asia/Kolkata') + make_interval(months => p_offset))::date, 'YYYY-MM-DD');
$$;

-- An HLC at a moment p_offset months from the start of the current month (India), plus p_minutes.
create or replace function tests.hlc_at(p_offset int, p_minutes int default 0)
returns text
language sql
stable
as $$
  select tests.hlc((extract(epoch from ((date_trunc('month', now() at time zone 'Asia/Kolkata')
                                         + make_interval(months => p_offset, mins => p_minutes)) at time zone 'Asia/Kolkata')) * 1000)::bigint,
                   (nextval('tests.hlc_counter') % 10000)::int);
$$;

-- A change with a chosen HLC (tests.lchange uses the clock).
create or replace function tests.hchange(p_entity text, p_entity_id uuid, p_kind text, p_fields jsonb, p_hlc text)
returns jsonb
language sql
volatile
as $$
  select jsonb_build_object('changeId', gen_random_uuid(), 'entity', p_entity, 'entityId', p_entity_id, 'kind', p_kind,
                            'hlc', p_hlc, 'fields', p_fields);
$$;

-- One terms entry; a null amount stays a JSON null.
create or replace function tests.term(p_from text, p_amount text, p_day int, p_account uuid)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('fromMonth', p_from, 'amountMinor', p_amount, 'dueDay', p_day, 'accountId', p_account);
$$;

-- A monthly payment to a business from p_start; override any key with p_extra.
create or replace function tests.plan_fields(p_name text, p_payee uuid, p_account uuid, p_amount text default '2500000',
                                             p_start text default null, p_extra jsonb default '{}')
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('name', p_name, 'target', 'payee', 'payeeId', p_payee, 'frequency', 'monthly',
                            'intervalMonths', 1, 'startMonth', coalesce(p_start, tests.month(0)),
                            'terms', jsonb_build_array(tests.term(coalesce(p_start, tests.month(0)), p_amount, 5, p_account)))
         || p_extra;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select pass('plan test helpers installed');
select * from finish();
commit;
