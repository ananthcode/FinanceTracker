-- T001 R9 audit vocabulary (specs/009-attachments-warranty/data-model.md). Own migration: enum values must
-- be committed before functions use them.

alter type public.audit_action add value if not exists 'attachment_created';
alter type public.audit_action add value if not exists 'attachment_edited';
alter type public.audit_action add value if not exists 'attachment_deleted';

alter table public.audit_events drop constraint audit_events_target_type_check;
alter table public.audit_events add constraint audit_events_target_type_check
  check (target_type in ('user', 'invitation', 'preferences', 'session', 'account', 'account_group',
                         'category', 'tag', 'payee', 'transaction', 'person_rate', 'plan_item', 'plan_month',
                         'template', 'attachment'));
