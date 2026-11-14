-- T002 Plan items, item months and payment links (specs/007-payment-plan/data-model.md).
-- Synced tables with R2's conventions: client-generated ids, per-field versions, server_seq. Clients
-- may only SELECT their own rows; every write goes through app.apply_changes.

-- The deterministic id of one item in one month (research R7-02): the item's uuid with its first 32
-- bits XOR-ed with year × 12 + month index. SQL twin of occurrenceId() in packages/core/src/plan/months.ts.
create or replace function app._plan_occurrence_id(p_item uuid, p_month date)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select (lpad(to_hex(('x' || lpad(left(p_item::text, 8), 16, '0'))::bit(64)::bigint
                      # (extract(year from p_month)::bigint * 12 + extract(month from p_month)::bigint - 1)), 8, '0')
          || substr(p_item::text, 9))::uuid;
$$;

-- Whether an item with these settings has a month (research R7-04). SQL twin of appliesIn().
create or replace function app._plan_applies(p_start date, p_end date, p_interval smallint, p_month date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_month >= p_start
     and (p_end is null or p_month <= p_end)
     and case when p_interval = 0 then p_month = p_start
              else ((extract(year from p_month) - extract(year from p_start)) * 12
                    + extract(month from p_month) - extract(month from p_start))::integer % p_interval = 0 end;
$$;

-- ---------------------------------------------------------------- plan items
create table public.plan_items (
  id              uuid primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  target          public.plan_target not null,
  -- payee: a business payee; person: a person payee.
  payee_id        uuid,
  category_id     uuid,
  card_account_id uuid,
  person_action   public.person_action,
  frequency       public.plan_frequency not null,
  interval_months smallint not null,
  start_month     date not null check (extract(day from start_month) = 1),
  end_month       date check (end_month is null or (extract(day from end_month) = 1 and end_month >= start_month)),
  amount_varies   boolean not null default false,
  -- [{ fromMonth, amountMinor | null, dueDay, accountId }] sorted by fromMonth (research R7-01).
  terms           jsonb not null check (jsonb_typeof(terms) = 'array' and jsonb_array_length(terms) between 1 and 120),
  notes           text check (notes is null or char_length(notes) <= 500),
  state           public.record_state not null default 'active' check (state in ('active', 'deleted')),
  deleted_at      timestamptz,
  field_versions  jsonb not null default '{}'::jsonb,
  server_seq      bigint not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  foreign key (payee_id, user_id) references public.payees (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (card_account_id, user_id) references public.accounts (id, user_id),
  constraint plan_items_target check (
    case target
      when 'payee' then payee_id is not null and card_account_id is null and person_action is null
      when 'card' then card_account_id is not null and payee_id is null and category_id is null and person_action is null
      when 'person' then payee_id is not null and card_account_id is null and category_id is null
                         and person_action in ('lent', 'repaid_to', 'paid_on_behalf')
    end),
  constraint plan_items_interval check (
    case frequency
      when 'monthly' then interval_months = 1
      when 'every_n_months' then interval_months between 2 and 12
      when 'yearly' then interval_months = 12
      when 'one_off' then interval_months = 0 and end_month = start_month
    end)
);

create index plan_items_sync_idx on public.plan_items (user_id, server_seq);
create index plan_items_state_idx on public.plan_items (user_id, state);
create index plan_items_payee_idx on public.plan_items (payee_id) where payee_id is not null;
create index plan_items_category_idx on public.plan_items (category_id) where category_id is not null;

-- ---------------------------------------------------------------- item months (only when the user set one)
create table public.plan_occurrences (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  item_id        uuid not null,
  month          date not null check (extract(day from month) = 1),
  -- null = not set: the usual amount or the estimate (R7-05).
  amount_minor   bigint check (amount_minor is null or amount_minor between 0 and 999999999999),
  skipped        boolean not null default false,
  state          public.record_state not null default 'active' check (state in ('active', 'deleted')),
  deleted_at     timestamptz,
  field_versions jsonb not null default '{}'::jsonb,
  server_seq     bigint not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id),
  unique (item_id, month),
  constraint plan_occurrences_id check (id = app._plan_occurrence_id(item_id, month)),
  foreign key (item_id, user_id) references public.plan_items (id, user_id)
);

create index plan_occurrences_sync_idx on public.plan_occurrences (user_id, server_seq);
create index plan_occurrences_month_idx on public.plan_occurrences (user_id, month);

-- ---------------------------------------------------------------- payment links (research R7-03)
alter table public.transactions add column plan_item_id uuid;
alter table public.transactions add column plan_month date;
alter table public.transactions add constraint transactions_plan_pair
  check ((plan_item_id is null) = (plan_month is null) and (plan_month is null or extract(day from plan_month) = 1));
alter table public.transactions add constraint transactions_plan_item_fk
  foreign key (plan_item_id, user_id) references public.plan_items (id, user_id);
create index transactions_plan_idx on public.transactions (user_id, plan_item_id, plan_month) where plan_item_id is not null;

-- ---------------------------------------------------------------- preferences (research R7-09)
alter table public.user_preferences add column plan_nudge boolean not null default true;
alter table public.user_preferences add column plan_checked_month date
  check (plan_checked_month is null or extract(day from plan_checked_month) = 1);
