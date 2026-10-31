-- T011 Transactions, person rates and derived postings (R4 data-model.md).
-- Synced tables with R2's conventions; clients SELECT their own rows only and write through
-- app.apply_changes. Postings are derived by trigger and live in the private schema (no client access).

alter table public.accounts add constraint accounts_id_user_unique unique (id, user_id);

-- ---------------------------------------------------------------- payees: interest setting (FR-013)
alter table public.payees add column interest_mode public.interest_mode not null default 'none';
alter table public.payees add constraint payees_business_no_interest check (kind = 'person' or interest_mode = 'none');

-- ---------------------------------------------------------------- transactions
create table public.transactions (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  date           date not null,
  time_of_day    time,
  kind           public.transaction_kind not null,
  flow           public.money_flow not null,
  account_id     uuid,
  to_account_id  uuid,
  amount_minor   bigint not null check (amount_minor between 1 and 999999999999),
  payee_id       uuid,
  person_action  public.person_action,
  category_id    uuid,
  -- Split lines (research R4-01): [{ id, amountMinor, categoryId, personId, personAction, notes, tagIds }]
  lines          jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  tag_ids        uuid[] not null default '{}',
  notes          text check (notes is null or char_length(notes) <= 1000),
  reference      text check (reference is null or char_length(reference) <= 40),
  status         public.transaction_status not null default 'uncleared',
  -- False while upcoming / awaiting confirmation and for interest proposals (FR-002a, FR-014).
  confirmed      boolean not null default true,
  generated      boolean not null default false,
  interest_month date,
  user_edited    boolean not null default false,
  state          public.record_state not null default 'active' check (state in ('active', 'deleted')),
  deleted_at     timestamptz,
  field_versions jsonb not null default '{}'::jsonb,
  server_seq     bigint not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id),
  -- Every reference stays within the owner, whatever the code does.
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id),
  foreign key (payee_id, user_id) references public.payees (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  -- Coarse shape per kind (the full rules are in app._apply_transaction).
  constraint transactions_shape check (
    case kind
      when 'transfer' then account_id is not null and to_account_id is not null and to_account_id <> account_id
                           and payee_id is null and person_action is null and category_id is null and flow = 'out'
      when 'person' then payee_id is not null and person_action is not null and to_account_id is null
                         and category_id is null and (account_id is null) = (person_action = 'adjustment')
      when 'interest' then payee_id is not null and account_id is null and to_account_id is null
                           and person_action is null and category_id is null
      else account_id is not null and to_account_id is null and person_action is null
           and flow = case kind when 'expense' then 'out'::public.money_flow else 'in'::public.money_flow end
    end),
  constraint transactions_generated check (not generated or (kind = 'interest' and interest_month is not null)),
  constraint transactions_interest_month check (interest_month is null or extract(day from interest_month) = 1)
);

-- Automatic interest is proposed at most once per person and month, whatever happened to it since
-- (deleted proposals included), so it is never recreated (FR-014).
create unique index transactions_interest_once on public.transactions (user_id, payee_id, interest_month) where generated;
create index transactions_list_idx on public.transactions (user_id, date desc, time_of_day desc nulls last, created_at desc);
create index transactions_sync_idx on public.transactions (user_id, server_seq);
create index transactions_account_idx on public.transactions (account_id) where account_id is not null;
create index transactions_to_account_idx on public.transactions (to_account_id) where to_account_id is not null;
create index transactions_payee_idx on public.transactions (payee_id) where payee_id is not null;
create index transactions_category_idx on public.transactions (category_id) where category_id is not null;
create index transactions_tags_idx on public.transactions using gin (tag_ids);
create index transactions_to_confirm_idx on public.transactions (user_id, date) where not confirmed and state = 'active';

-- ---------------------------------------------------------------- person rates (FR-013)
create table public.person_rates (
  id              uuid primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  payee_id        uuid not null,
  effective_month date not null check (extract(day from effective_month) = 1),
  -- Percent per month × 10⁴: 0 … 100000 (0–10 %), four decimals.
  rate_e4         integer not null check (rate_e4 between 0 and 100000),
  state           public.record_state not null default 'active' check (state in ('active', 'deleted')),
  deleted_at      timestamptz,
  field_versions  jsonb not null default '{}'::jsonb,
  server_seq      bigint not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  foreign key (payee_id, user_id) references public.payees (id, user_id)
);

create unique index person_rates_month_unique on public.person_rates (user_id, payee_id, effective_month) where state <> 'deleted';
create index person_rates_sync_idx on public.person_rates (user_id, server_seq);

-- ---------------------------------------------------------------- postings (derived; research R4-02)
create table private.transaction_postings (
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  line_no        integer not null,
  user_id        uuid not null,
  date           date not null,
  counted        boolean not null,
  posting_type   text not null check (posting_type in ('account', 'person', 'category')),
  account_id     uuid,
  person_id      uuid,
  category_id    uuid,
  category_kind  public.category_kind,
  effect         bigint not null
);

create index transaction_postings_tx_idx on private.transaction_postings (transaction_id);
create index transaction_postings_account_idx on private.transaction_postings (account_id) where posting_type = 'account';
create index transaction_postings_person_idx on private.transaction_postings (person_id) where posting_type = 'person';
create index transaction_postings_category_idx on private.transaction_postings (user_id, category_id, date) where posting_type = 'category';
revoke all on private.transaction_postings from public, anon, authenticated;

-- ---------------------------------------------------------------- access rules (constitution I)
alter table public.transactions enable row level security;
alter table public.person_rates enable row level security;
revoke all on public.transactions, public.person_rates from public, anon, authenticated;
grant select on public.transactions, public.person_rates to authenticated;

create policy transactions_select_own on public.transactions
  for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

create policy person_rates_select_own on public.person_rates
  for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

-- ---------------------------------------------------------------- triggers
create trigger transactions_stamp before insert or update on public.transactions
  for each row execute function sync.stamp_row();
create trigger transactions_capture_change after insert or update on public.transactions
  for each row execute function audit.capture_record_change('transaction');

create trigger person_rates_stamp before insert or update on public.person_rates
  for each row execute function sync.stamp_row();
create trigger person_rates_capture_change after insert or update on public.person_rates
  for each row execute function audit.capture_record_change('person_rate');
