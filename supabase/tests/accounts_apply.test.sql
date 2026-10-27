-- T010 app.apply_changes behaviour: state rules, merge, idempotency, names, limits (data-model.md,
-- contracts/sync-protocol.md; FR-002–FR-011, FR-021–FR-025, FR-030–FR-032, FR-034).
begin;
select plan(46);

select tests.as_superuser();
select tests.create_user('apply.asha@example.com') as asha_id \gset
select tests.create_user('apply.limits@example.com') as lim_id \gset
select gen_random_uuid() as acc \gset
select gen_random_uuid() as card \gset
select gen_random_uuid() as grp \gset
select gen_random_uuid() as dup_change \gset
select tests.authenticate_as(:'asha_id');

-- ---------------------------------------------------------------- create
select is(tests.apply1(tests.change('account', :'acc', 'create', tests.account_fields('Everyday Savings', 'bank', '5234050'),
                                    tests.hlc(1790000000000))) ->> 'status',
          'applied', 'create: a valid account is applied');
select is((select currency::text from public.accounts where id = :'acc'), 'INR', 'create: currency is the base currency (FR-007)');
select is((select user_id from public.accounts where id = :'acc'), :'asha_id'::uuid, 'create: owner is the caller');
select is((select opening_balance_minor from public.accounts where id = :'acc'), 5234050::bigint, 'create: opening balance stored exactly');
select is(tests.apply1(tests.change('account', gen_random_uuid(), 'create', tests.account_fields('  Untrimmed '))) ->> 'code',
          'VALIDATION_FAILED', 'create: untrimmed names from direct callers are refused');
select is(tests.apply1(tests.change('account', gen_random_uuid(), 'create',
            tests.account_fields('Future', 'bank', '0', jsonb_build_object('openingBalanceDate', (current_date + 2)::text)))) ->> 'code',
          'DATE_IN_FUTURE', 'create: a future opening date is refused (FR-004)');
select is(tests.apply1(tests.change('account', gen_random_uuid(), 'create',
            tests.account_fields('Neon', 'bank', '0', '{"colour":"neon"}'))) ->> 'code',
          'VALIDATION_FAILED', 'create: unknown colour keys are refused');
select is(tests.apply1(tests.change('account', gen_random_uuid(), 'create',
            tests.account_fields('Limit on bank', 'bank', '0', '{"creditLimitMinor":"100000"}'))) ->> 'code',
          'VALIDATION_FAILED', 'create: only credit cards have a credit limit (FR-006)');
select is(tests.apply1(tests.change('account', gen_random_uuid(), 'create', '{"name":"Half"}')) ->> 'code',
          'VALIDATION_FAILED', 'create: missing required fields are refused');

-- ---------------------------------------------------------------- names (FR-002, FR-032)
select is(tests.apply1(tests.change('account', gen_random_uuid(), 'create', tests.account_fields('everyday savings'),
                                    null, '{"onNameConflict":"reject"}')) ->> 'code',
          'NAME_TAKEN', 'names: duplicate ignoring case is refused when rejecting');
select is(tests.apply1(tests.change('account', gen_random_uuid(), 'create', tests.account_fields('Everyday Savings'),
                                    null, '{"onNameConflict":"suffix"}')) ->> 'renamedTo',
          'Everyday Savings (2)', 'names: offline duplicate is renamed with (2)');
select is(tests.apply1(tests.change('account', gen_random_uuid(), 'create', tests.account_fields('EVERYDAY SAVINGS'),
                                    null, '{"onNameConflict":"suffix"}')) ->> 'renamedTo',
          'EVERYDAY SAVINGS (3)', 'names: the next free number is used');
select tests.apply1(tests.change('account', gen_random_uuid(), 'create', tests.account_fields(repeat('x', 40))));
select is(char_length(tests.apply1(tests.change('account', gen_random_uuid(), 'create', tests.account_fields(repeat('X', 40)),
                                    null, '{"onNameConflict":"suffix"}')) ->> 'renamedTo'),
          40, 'names: a renamed 40-character name still fits in 40 characters');

-- ---------------------------------------------------------------- per-field merge (FR-030)
select is(tests.apply1(tests.change('account', :'acc', 'update', '{"name":"Main Savings"}', tests.hlc(1790000060000))) ->> 'appliedFields',
          '["name"]', 'merge: a newer edit applies');
select is(tests.apply1(tests.change('account', :'acc', 'update', '{"name":"Stale","colour":"teal"}',
                                    tests.hlc(1790000030000, 0, 'phone001'))) -> 'ignoredFields',
          '["name"]'::jsonb, 'merge: an older edit of the same field loses');
select is((select name || '/' || colour from public.accounts where id = :'acc'), 'Main Savings/teal',
          'merge: edits to different fields combine');
select is((app.merge_field_versions('{"name":"1793011200000.0000.webbrw01"}', '{name}', '1893011200000.0000.phone001',
                                    to_timestamp(1793011200))) ->> 'clamped',
          'true', 'merge: a far-future clock is clamped');
select is((app.merge_field_versions('{"name":"1793011200000.0000.webbrw01"}', '{name}', '1893011200000.0000.phone001',
                                    to_timestamp(1793011200))) -> 'fieldVersions' ->> 'name',
          '1793011500000.0000.phone001', 'merge: clamped to receive time + 5 minutes');
select is((app.merge_field_versions('{"notes":"1793011200000.0000.webbrw01"}', '{notes}', '1793011200000.0000.webbrw01',
                                    to_timestamp(1793011200))) -> 'ignored',
          '["notes"]'::jsonb, 'merge: an identical HLC keeps the stored value');
select is((app.merge_field_versions('{"notes":"1793011200000.0000.phone001"}', '{notes}', '1793011200000.0000.webbrw01',
                                    to_timestamp(1793011200))) -> 'applied',
          '["notes"]'::jsonb, 'merge: device id breaks a tie');

-- ---------------------------------------------------------------- idempotency (FR-031, rule 7)
select tests.apply1(tests.change('account', gen_random_uuid(), 'create', tests.account_fields('Once only'), null, null, :'dup_change'));
select is(tests.apply1(tests.change('account', gen_random_uuid(), 'create', tests.account_fields('Once only 2'), null, null, :'dup_change')) ->> 'status',
          'duplicate', 'idempotency: a replayed change id returns duplicate');
select is((select count(*)::int from public.accounts where name like 'Once only%'), 1, 'idempotency: applied exactly once');
-- Run the batch in its own statement: a later statement sees its rows.
select app.apply_changes(jsonb_build_array(
         tests.change('account', gen_random_uuid(), 'create', tests.account_fields('Batch A')),
         tests.change('account', gen_random_uuid(), 'create', tests.account_fields('Batch B', 'bank', '0', '{"icon":"rocket"}')),
         tests.change('account', gen_random_uuid(), 'create', tests.account_fields('Batch C'))), 'web')::text as batch_result \gset
select is((select jsonb_agg(e ->> 'status') from jsonb_array_elements(:'batch_result'::jsonb) e)
            || jsonb_build_array((select count(*) from public.accounts where name in ('Batch A', 'Batch C'))),
          '["applied", "rejected", "applied", 2]'::jsonb, 'batch: a failing change is rejected alone; the others apply');

-- ---------------------------------------------------------------- archive / restore / delete (FR-021–FR-024)
select is(tests.apply1(tests.change('account', :'acc', 'archive')) ->> 'code', 'BALANCE_NOT_ZERO',
          'archive: refused while the balance is not zero (FR-022)');
select is((select state::text from public.accounts where id = :'acc'), 'active', 'archive: state unchanged after refusal');
select tests.apply1(tests.change('account', :'acc', 'update', '{"openingBalanceMinor":"0","sortKey":"a5"}'));
select is(tests.apply1(tests.change('account', :'acc', 'archive')) ->> 'status', 'applied', 'archive: allowed at ₹0.00');
select is((select state::text from public.accounts where id = :'acc'), 'archived', 'archive: state is archived');
select is(tests.apply1(tests.change('account', :'acc', 'update', '{"notes":"closed in 2026"}')) ->> 'status', 'applied',
          'archive: an archived account can still be edited');
select is(tests.apply1(tests.change('account', :'acc', 'restore')) ->> 'status', 'applied', 'restore: applied');
select is((select state::text || '/' || sort_key from public.accounts where id = :'acc'), 'active/a5',
          'restore: back to active at its previous position (FR-023)');
select is(tests.apply1(tests.change('account', :'acc', 'delete')) ->> 'status', 'applied', 'delete: an unused account is deleted');
select is((select state::text from public.accounts where id = :'acc'), 'deleted', 'delete: soft deletion (FR-024)');
select is(tests.apply1(tests.change('account', :'acc', 'update', '{"name":"Ghost"}')) ->> 'code', 'NOT_FOUND',
          'delete: a deleted account cannot be edited');
select is(tests.apply1(tests.change('account', gen_random_uuid(), 'create', tests.account_fields('Main Savings'),
                                    null, '{"onNameConflict":"reject"}')) ->> 'status',
          'applied', 'delete: a deleted account''s name is free again');

-- Activity (R4 replaces this function): delete becomes archive at zero, refused otherwise (FR-034).
select tests.as_superuser();
create or replace function app.account_has_activity(p_account uuid) returns boolean language sql stable set search_path = '' as $$ select true $$;
select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.change('account', :'card', 'create', tests.account_fields('Rewards Card', 'credit_card', '1825000', '{"creditLimitMinor":"5000000","icon":"credit-card"}')));
select is(tests.apply1(tests.change('account', :'card', 'delete')) ->> 'code', 'HAS_ACTIVITY',
          'delete: refused for an account with activity and a balance');
select tests.apply1(tests.change('account', :'card', 'update', '{"openingBalanceMinor":"0"}'));
select is(tests.apply1(tests.change('account', :'card', 'delete')) ->> 'status', 'converted',
          'delete: converted to archive for an account with activity at zero');
select is((select state::text from public.accounts where id = :'card'), 'archived', 'delete: the converted account is archived');

-- ---------------------------------------------------------------- type change drops the credit limit
select tests.apply1(tests.change('account', :'card', 'restore'));
select tests.apply1(tests.change('account', :'card', 'update', '{"type":"bank"}'));
select is((select type::text || '/' || coalesce(credit_limit_minor::text, 'none') from public.accounts where id = :'card'), 'bank/none',
          'type: changing a card to an owned type removes its credit limit');

-- ---------------------------------------------------------------- groups (FR-009a/b)
select is(tests.apply1(tests.change('account_group', :'grp', 'create', '{"name":"Held for family","sortKey":"a0"}')) ->> 'status',
          'applied', 'groups: created');
select is(tests.apply1(tests.change('account_group', gen_random_uuid(), 'create', '{"name":"held FOR family","sortKey":"a1"}')) ->> 'code',
          'GROUP_NAME_TAKEN', 'groups: names are unique ignoring case');
select tests.apply1(tests.change('account', :'card', 'update', jsonb_build_object('groupId', :'grp')));
select is(tests.apply1(tests.change('account_group', :'grp', 'delete')) ->> 'status', 'applied', 'groups: deleted');
select is((select group_id from public.accounts where id = :'card'), null::uuid,
          'groups: deleting a group moves its accounts to Ungrouped');
select tests.apply1(tests.change('account', :'card', 'update', jsonb_build_object('groupId', :'grp')));
select is((select group_id from public.accounts where id = :'card'), null::uuid,
          'groups: pointing at a deleted group stores no group');

-- ---------------------------------------------------------------- server_seq increases per user
select is((select id from public.accounts order by server_seq desc limit 1), :'card'::uuid,
          'sync: the most recently changed row has the highest server_seq');

-- ---------------------------------------------------------------- limits (FR-025, FR-009a)
select tests.as_superuser();
insert into public.accounts (id, user_id, name, type, opening_balance_minor, opening_balance_date, currency, colour, icon, sort_key)
select gen_random_uuid(), :'lim_id', 'Seed ' || g, 'cash', 0, '2026-04-01', 'INR', 'green', 'banknote', 'a0'
  from generate_series(1, 200) g;
insert into public.account_groups (id, user_id, name, sort_key)
select gen_random_uuid(), :'lim_id', 'Group ' || g, 'a0' from generate_series(1, 30) g;
select tests.authenticate_as(:'lim_id');
select is(tests.apply1(tests.change('account', gen_random_uuid(), 'create', tests.account_fields('One too many'))) ->> 'code',
          'LIMIT_REACHED', 'limits: the 201st account is refused');
select is(tests.apply1(tests.change('account_group', gen_random_uuid(), 'create', '{"name":"Group 31","sortKey":"a1"}')) ->> 'code',
          'LIMIT_REACHED', 'limits: the 31st group is refused');

select * from finish();
rollback;
