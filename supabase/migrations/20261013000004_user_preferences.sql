-- T016 User preferences (FR-020–FR-025).

create table public.user_preferences (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  base_currency  char(3) not null default 'INR',
  number_format  public.number_format not null default 'indian',
  date_format    public.date_format not null default 'dd-MMM-yyyy',
  fy_start_month smallint not null default 4,
  timezone       text not null default 'Asia/Kolkata',
  updated_at     timestamptz not null default now(),
  constraint user_preferences_currency_iso check (base_currency ~ '^[A-Z]{3}$'),
  constraint user_preferences_fy_month check (fy_start_month between 1 and 12)
);

create trigger user_preferences_touch_updated_at
  before update on public.user_preferences
  for each row execute function app.touch_updated_at();

-- Timezone must be a known IANA zone (pg_timezone_names).
create or replace function app.validate_preferences()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'INVALID_TIMEZONE' using errcode = '22023', detail = 'Unknown timezone';
  end if;
  return new;
end;
$$;

create trigger user_preferences_validate
  before insert or update on public.user_preferences
  for each row execute function app.validate_preferences();

-- FR-021: base currency is immutable once setup is complete.
create or replace function app.lock_base_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.base_currency is distinct from old.base_currency
     and exists (
       select 1 from public.profiles p
       where p.user_id = old.user_id and p.setup_completed_at is not null
     ) then
    raise exception 'BASE_CURRENCY_LOCKED' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger lock_base_currency
  before update on public.user_preferences
  for each row execute function app.lock_base_currency();

alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from anon, authenticated;
