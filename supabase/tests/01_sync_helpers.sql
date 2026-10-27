-- R2 pgTAP helpers for building sync changes (contracts/sync-protocol.md). LOCAL database only.
begin;
select plan(1);

-- An HLC string: 13-digit wall millis . 4-digit counter . device id.
create or replace function tests.hlc(p_wall bigint, p_counter int default 0, p_device text default 'webbrw01')
returns text
language sql
immutable
as $$
  select lpad(p_wall::text, 13, '0') || '.' || lpad(p_counter::text, 4, '0') || '.' || p_device;
$$;

-- One change object.
create or replace function tests.change(
  p_entity text,
  p_entity_id uuid,
  p_kind text,
  p_fields jsonb default null,
  p_hlc text default null,
  p_options jsonb default null,
  p_change_id uuid default gen_random_uuid()
)
returns jsonb
language sql
volatile
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'changeId', p_change_id,
    'entity', p_entity,
    'entityId', p_entity_id,
    'kind', p_kind,
    'fields', p_fields,
    'hlc', coalesce(p_hlc, tests.hlc((extract(epoch from clock_timestamp()) * 1000)::bigint)),
    'options', p_options));
$$;

-- Fields for a new account; override any key with p_extra.
create or replace function tests.account_fields(p_name text, p_type text default 'bank', p_opening text default '0', p_extra jsonb default '{}')
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'name', p_name, 'type', p_type, 'openingBalanceMinor', p_opening, 'openingBalanceDate', '2026-04-01',
    'colour', 'blue', 'icon', 'bank', 'sortKey', 'a0') || p_extra;
$$;

-- Applies a single change as the current user and returns its result.
create or replace function tests.apply1(p_change jsonb, p_device text default 'web')
returns jsonb
language sql
volatile
as $$
  select app.apply_changes(jsonb_build_array(p_change), p_device) -> 0;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select pass('sync test helpers installed');
select * from finish();
commit;
