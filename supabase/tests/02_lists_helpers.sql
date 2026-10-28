-- R3 pgTAP helpers for categories, tags and payees. LOCAL database only.
begin;
select plan(1);

-- A strictly increasing HLC for this database session (same-millisecond changes still order).
create sequence if not exists tests.hlc_counter;
create or replace function tests.tick()
returns text
language sql
volatile
as $$
  select tests.hlc((extract(epoch from clock_timestamp()) * 1000)::bigint, (nextval('tests.hlc_counter') % 10000)::int);
$$;

-- One change with a fresh, increasing HLC. Unlike tests.change it keeps nulls inside `fields`
-- (e.g. {"parentId": null} moves a category to the top level).
create or replace function tests.lchange(p_entity text, p_entity_id uuid, p_kind text, p_fields jsonb default null,
                                         p_options jsonb default null)
returns jsonb
language sql
volatile
as $$
  select jsonb_build_object('changeId', gen_random_uuid(), 'entity', p_entity, 'entityId', p_entity_id, 'kind', p_kind,
                            'hlc', tests.tick())
         || case when p_fields is null then '{}'::jsonb else jsonb_build_object('fields', p_fields) end
         || case when p_options is null then '{}'::jsonb else jsonb_build_object('options', p_options) end;
$$;

-- Applies one change and returns its status, or its code when rejected.
create or replace function tests.outcome(p_change jsonb, p_device text default 'web')
returns text
language sql
volatile
as $$
  select case when r ->> 'status' = 'rejected' then r ->> 'code' else r ->> 'status' end
    from (select tests.apply1(p_change, p_device) as r) x;
$$;

create or replace function tests.category_fields(p_name text, p_kind text default 'expense', p_parent uuid default null,
                                                 p_extra jsonb default '{}')
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('name', p_name, 'kind', p_kind, 'parentId', p_parent, 'colour', 'green',
                            'icon', 'shopping-cart') || p_extra;
$$;

create or replace function tests.business_fields(p_name text, p_extra jsonb default '{}')
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('name', p_name, 'kind', 'business') || p_extra;
$$;

create or replace function tests.person_fields(p_name text, p_opening text default '0', p_extra jsonb default '{}')
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('name', p_name, 'kind', 'person', 'openingBalanceMinor', p_opening,
                            'openingBalanceDate', '2026-04-01') || p_extra;
$$;

grant usage on sequence tests.hlc_counter to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

select pass('list test helpers installed');
select * from finish();
commit;
