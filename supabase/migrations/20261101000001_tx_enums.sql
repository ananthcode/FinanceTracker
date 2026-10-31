-- T010 R4 enums and audit vocabulary (specs/004-transactions/data-model.md §Enums).

create type public.transaction_kind as enum ('expense', 'income', 'refund', 'transfer', 'person', 'interest');
create type public.money_flow as enum ('out', 'in');
create type public.person_action as enum ('lent', 'repaid_to', 'paid_on_behalf', 'borrowed', 'received_back',
                                          'collected_on_behalf', 'adjustment');
create type public.transaction_status as enum ('uncleared', 'cleared', 'follow_up', 'void');
create type public.interest_mode as enum ('none', 'automatic', 'manual');

alter type public.audit_action add value if not exists 'transaction_created';
alter type public.audit_action add value if not exists 'transaction_edited';
alter type public.audit_action add value if not exists 'transaction_confirmed';
alter type public.audit_action add value if not exists 'transaction_deleted';
alter type public.audit_action add value if not exists 'person_rate_created';
alter type public.audit_action add value if not exists 'person_rate_edited';
alter type public.audit_action add value if not exists 'person_rate_deleted';
alter type public.audit_action add value if not exists 'category_relocated';
alter type public.audit_action add value if not exists 'payee_relocated';

alter table public.audit_events drop constraint audit_events_target_type_check;
alter table public.audit_events add constraint audit_events_target_type_check
  check (target_type in ('user', 'invitation', 'preferences', 'session', 'account', 'account_group',
                         'category', 'tag', 'payee', 'transaction', 'person_rate'));
