-- T001 R10 audit vocabulary (specs/010-data-export/data-model.md). Own migration: enum values must be
-- committed before functions use them.

alter type public.audit_action add value if not exists 'data_exported';
alter type public.audit_action add value if not exists 'data_imported';
alter type public.audit_action add value if not exists 'data_import_undone';
