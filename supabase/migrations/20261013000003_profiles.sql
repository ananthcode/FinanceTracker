-- T015 Profiles: one row per user, created by trigger when an auth user is inserted.

create table public.profiles (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  email                   extensions.citext not null unique,
  display_name            text,
  role                    public.user_role not null default 'member',
  status                  public.access_status not null default 'active',
  setup_completed_at      timestamptz,
  last_sign_in_at         timestamptz,
  privacy_notice_shown_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- FR-020: 1–50 characters after trim
  constraint profiles_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 1 and 50),
  constraint profiles_setup_needs_name
    check (setup_completed_at is null or display_name is not null)
);

-- FR-013: at most one owner-admin per environment.
create unique index profiles_single_owner on public.profiles (role) where role = 'owner';

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function app.touch_updated_at();

alter table public.profiles enable row level security;
-- Default deny; policies are added in the access-rules migration.
revoke all on public.profiles from anon, authenticated;
