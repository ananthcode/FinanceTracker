-- T003 Attachment records, warranty fields and reminder preferences
-- (specs/009-attachments-warranty/data-model.md; research R9-02, R9-05, R9-06).
--
-- REVIEW (constitution workflow — RLS): attachments are SELECT-only for their owner (active users); every
-- write goes through app.apply_changes. A composite foreign key keeps the transaction the owner's. The two
-- reminder preferences are client-updatable on the user's own row only (existing update policy).

create table public.attachments (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null,
  name           text not null check (char_length(name) between 1 and 120 and name = btrim(name)),
  content_type   text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes     bigint not null check (size_bytes between 1 and 10485760),
  state          public.record_state not null default 'active' check (state in ('active', 'deleted')),
  deleted_at     timestamptz,
  field_versions jsonb not null default '{}'::jsonb,
  server_seq     bigint not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id)
);

create index attachments_sync_idx on public.attachments (user_id, server_seq);
create index attachments_transaction_idx on public.attachments (transaction_id) where state = 'active';

alter table public.attachments enable row level security;
revoke all on public.attachments from public, anon, authenticated;
grant select on public.attachments to authenticated;

create policy attachments_select_own on public.attachments
  for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

create trigger attachments_stamp before insert or update on public.attachments
  for each row execute function sync.stamp_row();
create trigger attachments_capture_change after insert or update on public.attachments
  for each row execute function audit.capture_record_change('attachment');

-- ---------------------------------------------------------------- warranty (research R9-05)
alter table public.transactions add column warranty_until date;
alter table public.transactions add column warranty_note text
  check (warranty_note is null or char_length(warranty_note) between 1 and 200);
-- 0 none, 1 the first reminder dismissed, 2 the second dismissed.
alter table public.transactions add column warranty_dismissed smallint not null default 0
  check (warranty_dismissed between 0 and 2);
alter table public.transactions add constraint transactions_warranty
  check ((warranty_until is null or warranty_until >= date) and (warranty_note is null or warranty_until is not null));
create index transactions_warranty_idx on public.transactions (user_id, warranty_until) where warranty_until is not null;

-- ---------------------------------------------------------------- reminder days (research R9-06)
alter table public.user_preferences add column warranty_first_days smallint not null default 60
  check (warranty_first_days in (15, 30, 60, 90));
alter table public.user_preferences add column warranty_second_days smallint default 30
  check (warranty_second_days is null or warranty_second_days in (15, 30, 60));
alter table public.user_preferences add constraint user_preferences_warranty_order
  check (warranty_second_days is null or warranty_second_days < warranty_first_days);
grant update (warranty_first_days, warranty_second_days) on public.user_preferences to authenticated;
