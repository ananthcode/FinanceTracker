-- T024 Accounts and user groups (data-model.md; FR-001–FR-011, FR-021–FR-026).
-- Synced tables: client-generated ids, per-field versions, server_seq (research R2-01 … R2-04).
-- Clients may only SELECT their own rows; every write goes through app.apply_changes().

-- ---------------------------------------------------------------- account_groups
create table public.account_groups (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 30 and name = btrim(name)),
  -- Fractional index keys are ordered byte-wise, like JavaScript string comparison.
  sort_key       text collate "C" not null check (char_length(sort_key) between 1 and 1000),
  state          public.record_state not null default 'active' check (state in ('active', 'deleted')),
  deleted_at     timestamptz,
  field_versions jsonb not null default '{}'::jsonb,
  server_seq     bigint not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id)
);

create unique index account_groups_name_unique on public.account_groups (user_id, lower(name)) where state = 'active';
create index account_groups_sync_idx on public.account_groups (user_id, server_seq);

-- ---------------------------------------------------------------- accounts
create table public.accounts (
  id                    uuid primary key,
  user_id               uuid not null references auth.users (id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  type                  public.account_type not null,
  -- Held amount (bank, cash, wallet) or owed amount (credit card), in paise (FR-003, FR-005).
  opening_balance_minor bigint not null check (opening_balance_minor between -999999999999 and 999999999999),
  opening_balance_date  date not null,
  currency              char(3) not null check (currency ~ '^[A-Z]{3}$'),
  colour                text not null check (colour in ('blue', 'teal', 'green', 'olive', 'amber', 'orange', 'red',
                                                        'pink', 'purple', 'indigo', 'slate', 'brown')),
  icon                  text not null check (icon in ('bank', 'building', 'piggy-bank', 'safe', 'wallet', 'banknote',
                                                      'coins', 'credit-card', 'smartphone', 'briefcase', 'home', 'car',
                                                      'fuel', 'shopping-bag', 'utensils', 'gift', 'graduation-cap',
                                                      'heart', 'plane', 'receipt', 'users', 'baby', 'star', 'globe')),
  sort_key              text collate "C" not null check (char_length(sort_key) between 1 and 1000),
  group_id              uuid,
  include_in_net_worth  boolean not null default true,
  notes                 text check (notes is null or char_length(notes) <= 500),
  credit_limit_minor    bigint check (credit_limit_minor is null
                                      or (type = 'credit_card' and credit_limit_minor between 1 and 999999999999)),
  state                 public.record_state not null default 'active',
  archived_at           timestamptz,
  deleted_at            timestamptz,
  field_versions        jsonb not null default '{}'::jsonb,
  server_seq            bigint not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- An account can only ever be in one of its owner's groups.
  foreign key (group_id, user_id) references public.account_groups (id, user_id)
);

-- Names are unique per user ignoring case among accounts that are not deleted (FR-002).
create unique index accounts_name_unique on public.accounts (user_id, lower(name)) where state <> 'deleted';
create index accounts_sync_idx on public.accounts (user_id, server_seq);
create index accounts_group_idx on public.accounts (group_id) where group_id is not null;

-- ---------------------------------------------------------------- access rules (constitution I)
alter table public.account_groups enable row level security;
alter table public.accounts enable row level security;
revoke all on public.account_groups, public.accounts from public, anon, authenticated;
grant select on public.account_groups, public.accounts to authenticated;

create policy account_groups_select_own on public.account_groups
  for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

create policy accounts_select_own on public.accounts
  for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

-- ---------------------------------------------------------------- triggers
create trigger account_groups_stamp before insert or update on public.account_groups
  for each row execute function sync.stamp_row();
create trigger account_groups_capture_change after insert or update on public.account_groups
  for each row execute function audit.capture_record_change('account_group');

create trigger accounts_stamp before insert or update on public.accounts
  for each row execute function sync.stamp_row();
create trigger accounts_capture_change after insert or update on public.accounts
  for each row execute function audit.capture_record_change('account');
