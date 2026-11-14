-- T001 R7 enums and audit vocabulary (specs/007-payment-plan/data-model.md). Own migration: enum values
-- must be committed before functions use them.

create type public.plan_frequency as enum ('monthly', 'every_n_months', 'yearly', 'one_off');
create type public.plan_target as enum ('payee', 'card', 'person');

alter type public.audit_action add value if not exists 'plan_item_created';
alter type public.audit_action add value if not exists 'plan_item_edited';
alter type public.audit_action add value if not exists 'plan_item_deleted';
alter type public.audit_action add value if not exists 'plan_month_created';
alter type public.audit_action add value if not exists 'plan_month_edited';

alter table public.audit_events drop constraint audit_events_target_type_check;
alter table public.audit_events add constraint audit_events_target_type_check
  check (target_type in ('user', 'invitation', 'preferences', 'session', 'account', 'account_group',
                         'category', 'tag', 'payee', 'transaction', 'person_rate', 'plan_item', 'plan_month'));
