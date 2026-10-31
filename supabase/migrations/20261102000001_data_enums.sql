-- T002 R5 history actions (specs/005-demo-data/data-model.md). Own migration: enum values must be
-- committed before functions use them.
alter type public.audit_action add value if not exists 'demo_data_loaded';
alter type public.audit_action add value if not exists 'data_reset';
