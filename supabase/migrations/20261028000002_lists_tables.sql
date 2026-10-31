-- T010 Categories, tags and payees (R3 data-model.md; FR-001–FR-025).
-- Synced tables with R2's conventions: client-generated ids, per-field versions, server_seq.
-- Clients may only SELECT their own rows; every write goes through app.apply_changes() (or, for the
-- default categories, app.start_categories()).

-- ---------------------------------------------------------------- categories
create table public.categories (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  -- Fixed on create; sub-categories share their parent's kind (FR-001).
  kind           public.category_kind not null,
  parent_id      uuid check (parent_id <> id),
  colour         text not null check (colour in ('blue', 'teal', 'green', 'olive', 'amber', 'orange', 'red',
                                                 'pink', 'purple', 'indigo', 'slate', 'brown')),
  -- APPEARANCE_ICON_KEYS in packages/core/src/appearance/icons.ts (R3-09).
  icon           text not null check (icon in (
                   'bank', 'building', 'piggy-bank', 'safe', 'wallet', 'banknote', 'coins', 'credit-card',
                   'smartphone', 'briefcase', 'home', 'car', 'fuel', 'shopping-bag', 'utensils', 'gift',
                   'graduation-cap', 'heart', 'plane', 'receipt', 'users', 'baby', 'star', 'globe',
                   'shopping-cart', 'zap', 'droplet', 'flame', 'wifi', 'tv', 'bus', 'wrench', 'stethoscope', 'pill',
                   'book', 'shirt', 'laptop', 'sparkles', 'party-popper', 'hand-heart', 'paw-print', 'film',
                   'ticket', 'bed', 'shield', 'scale', 'percent', 'package')),
  hidden         boolean not null default false,
  state          public.record_state not null default 'active' check (state in ('active', 'deleted')),
  merged_into    uuid,
  deleted_at     timestamptz,
  field_versions jsonb not null default '{}'::jsonb,
  server_seq     bigint not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, kind),
  -- A parent belongs to the same user and has the same kind, whatever the code does.
  foreign key (parent_id, user_id, kind) references public.categories (id, user_id, kind),
  foreign key (merged_into, user_id) references public.categories (id, user_id)
);

-- Names are unique among siblings, ignoring case (FR-002).
create unique index categories_name_unique on public.categories
  (user_id, kind, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  where state <> 'deleted';
create index categories_sync_idx on public.categories (user_id, server_seq);
create index categories_parent_idx on public.categories (parent_id) where parent_id is not null;

-- ---------------------------------------------------------------- tags
create table public.tags (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 30 and name = btrim(name)),
  state          public.record_state not null default 'active' check (state in ('active', 'deleted')),
  merged_into    uuid,
  deleted_at     timestamptz,
  field_versions jsonb not null default '{}'::jsonb,
  server_seq     bigint not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id),
  foreign key (merged_into, user_id) references public.tags (id, user_id)
);

create unique index tags_name_unique on public.tags (user_id, lower(name)) where state <> 'deleted';
create index tags_sync_idx on public.tags (user_id, server_seq);

-- ---------------------------------------------------------------- payees
create table public.payees (
  id                    uuid primary key,
  user_id               uuid not null references auth.users (id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  kind                  public.payee_kind not null,
  default_category_id   uuid,
  notes                 text check (notes is null or char_length(notes) <= 500),
  hidden                boolean not null default false,
  -- People only: positive = they owe the user, negative = the user owes them, in paise (FR-016).
  opening_balance_minor bigint not null default 0
                          check (opening_balance_minor between -999999999999 and 999999999999),
  opening_balance_date  date,
  include_in_net_worth  boolean not null default false,
  state                 public.record_state not null default 'active' check (state in ('active', 'deleted')),
  merged_into           uuid,
  deleted_at            timestamptz,
  field_versions        jsonb not null default '{}'::jsonb,
  server_seq            bigint not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id),
  -- A business carries no balance and never counts in net worth; a person has an opening date.
  constraint payees_business_neutral check (kind = 'person' or (opening_balance_minor = 0
                                            and opening_balance_date is null and not include_in_net_worth)),
  constraint payees_person_dated check (kind = 'business' or opening_balance_date is not null),
  foreign key (default_category_id, user_id) references public.categories (id, user_id),
  foreign key (merged_into, user_id) references public.payees (id, user_id)
);

create unique index payees_name_unique on public.payees (user_id, lower(name)) where state <> 'deleted';
create index payees_sync_idx on public.payees (user_id, server_seq);
create index payees_default_category_idx on public.payees (default_category_id) where default_category_id is not null;

-- ---------------------------------------------------------------- access rules (constitution I)
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.payees enable row level security;
revoke all on public.categories, public.tags, public.payees from public, anon, authenticated;
grant select on public.categories, public.tags, public.payees to authenticated;

create policy categories_select_own on public.categories
  for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

create policy tags_select_own on public.tags
  for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

create policy payees_select_own on public.payees
  for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

-- ---------------------------------------------------------------- triggers
create trigger categories_stamp before insert or update on public.categories
  for each row execute function sync.stamp_row();
create trigger categories_capture_change after insert or update on public.categories
  for each row execute function audit.capture_record_change('category');

create trigger tags_stamp before insert or update on public.tags
  for each row execute function sync.stamp_row();
create trigger tags_capture_change after insert or update on public.tags
  for each row execute function audit.capture_record_change('tag');

create trigger payees_stamp before insert or update on public.payees
  for each row execute function sync.stamp_row();
create trigger payees_capture_change after insert or update on public.payees
  for each row execute function audit.capture_record_change('payee');
