-- T009 R3 enums and audit vocabulary (specs/003-categories-tags-payees/data-model.md §Enums).

create type public.category_kind as enum ('expense', 'income');
create type public.payee_kind as enum ('business', 'person');
create type public.categories_start as enum ('suggested', 'empty');

alter type public.audit_action add value if not exists 'category_created';
alter type public.audit_action add value if not exists 'category_edited';
alter type public.audit_action add value if not exists 'category_moved';
alter type public.audit_action add value if not exists 'category_hidden';
alter type public.audit_action add value if not exists 'category_unhidden';
alter type public.audit_action add value if not exists 'category_merged';
alter type public.audit_action add value if not exists 'category_deleted';
alter type public.audit_action add value if not exists 'category_sync_renamed';
alter type public.audit_action add value if not exists 'tag_created';
alter type public.audit_action add value if not exists 'tag_renamed';
alter type public.audit_action add value if not exists 'tag_merged';
alter type public.audit_action add value if not exists 'tag_deleted';
alter type public.audit_action add value if not exists 'tag_sync_renamed';
alter type public.audit_action add value if not exists 'payee_created';
alter type public.audit_action add value if not exists 'payee_edited';
alter type public.audit_action add value if not exists 'payee_hidden';
alter type public.audit_action add value if not exists 'payee_unhidden';
alter type public.audit_action add value if not exists 'payee_merged';
alter type public.audit_action add value if not exists 'payee_deleted';
alter type public.audit_action add value if not exists 'payee_sync_renamed';

alter table public.audit_events drop constraint audit_events_target_type_check;
alter table public.audit_events add constraint audit_events_target_type_check
  check (target_type in ('user', 'invitation', 'preferences', 'session', 'account', 'account_group',
                         'category', 'tag', 'payee'));
