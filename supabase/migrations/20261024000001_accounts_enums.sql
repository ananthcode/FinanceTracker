-- T021 R2 enums and audit vocabulary (data-model.md §Enums).

create type public.account_type as enum ('bank', 'cash', 'wallet', 'credit_card');
create type public.record_state as enum ('active', 'archived', 'deleted');
create type public.accounts_view as enum ('by_type', 'my_groups');

alter type public.audit_action add value if not exists 'account_created';
alter type public.audit_action add value if not exists 'account_edited';
alter type public.audit_action add value if not exists 'account_reordered';
alter type public.audit_action add value if not exists 'account_archived';
alter type public.audit_action add value if not exists 'account_restored';
alter type public.audit_action add value if not exists 'account_deleted';
alter type public.audit_action add value if not exists 'account_sync_renamed';
alter type public.audit_action add value if not exists 'account_group_created';
alter type public.audit_action add value if not exists 'account_group_renamed';
alter type public.audit_action add value if not exists 'account_group_reordered';
alter type public.audit_action add value if not exists 'account_group_deleted';

alter table public.audit_events drop constraint audit_events_target_type_check;
alter table public.audit_events add constraint audit_events_target_type_check
  check (target_type in ('user', 'invitation', 'preferences', 'session', 'account', 'account_group'));
