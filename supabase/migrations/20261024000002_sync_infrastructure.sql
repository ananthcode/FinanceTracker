-- T022 Sync infrastructure shared by every synced table (research R2-03, R2-04).

create schema if not exists sync;
revoke all on schema sync from public, anon, authenticated;

-- One global, ever-increasing change number; pull cursors are positions in it.
create sequence sync.seq as bigint;

-- Stamps a synced row before it is written. Taking the owner's advisory lock first serialises all
-- writes to one user's synced rows, so for that user the sequence order equals the commit order and
-- a pull cursor can never skip a row that commits late (R2-04). Every synced table uses this trigger.
create or replace function sync.stamp_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('sync:' || new.user_id::text, 0));
  new.server_seq := nextval('sync.seq');
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  return new;
end;
$$;

-- Exactly-once application of client changes (R2-03). Server only.
create table private.applied_changes (
  user_id    uuid not null references auth.users (id) on delete cascade,
  change_id  uuid not null,
  applied_at timestamptz not null default now(),
  result     jsonb not null default '{}'::jsonb,
  primary key (user_id, change_id)
);

revoke all on private.applied_changes from public, anon, authenticated;
