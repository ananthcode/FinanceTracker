-- T014 Enumerations (data-model.md).

create type public.user_role as enum ('owner', 'member');

create type public.access_status as enum ('active', 'disabled');

-- "expired" is derived: status = 'pending' and expires_at <= now().
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'superseded');

create type public.invitation_delivery_status as enum ('sent', 'failed');

create type public.number_format as enum ('indian', 'international');

create type public.date_format as enum ('dd-MMM-yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd');

-- FR-037 — the 20 audited actions.
create type public.audit_action as enum (
  'invitation_created',
  'invitation_resent',
  'invitation_revoked',
  'invitation_accepted',
  'invitation_expired',
  'invitation_delivery_failed',
  'owner_recovered',
  'user_disabled',
  'user_enabled',
  'user_erased',
  'sign_in_succeeded',
  'sign_in_failed',
  'sign_in_locked',
  'password_reset_requested',
  'password_reset_completed',
  'signed_out',
  'preference_changed',
  'setup_completed',
  'app_lock_enabled',
  'app_lock_disabled'
);
