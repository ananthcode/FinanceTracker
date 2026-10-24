-- T017 Invitations (FR-001–FR-003b). No client access at all: the owner works through server
-- endpoints with the service role; invitees look up status through GET /api/invitations/{token}.

create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  email            extensions.citext not null,
  role             public.user_role not null default 'member',
  -- SHA-256 of the emailed token; the raw token is never stored (FR-003a).
  token_hash       bytea not null unique,
  status           public.invitation_status not null default 'pending',
  invited_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '7 days'),
  accepted_at      timestamptz,
  revoked_at       timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  superseded_by    uuid references public.invitations (id) on delete set null,
  delivery_status  public.invitation_delivery_status,
  constraint invitations_expiry_after_creation check (expires_at > created_at),
  constraint invitations_token_hash_length check (octet_length(token_hash) = 32)
);

-- One pending invitation per email.
create unique index invitations_one_pending_per_email
  on public.invitations (email) where status = 'pending';

alter table public.invitations enable row level security;
revoke all on public.invitations from anon, authenticated;
