-- R8 T008 Writes for templates (contracts/sync-protocol.md; research R8-01, R8-04, R8-08).
begin;
select plan(19);

select tests.as_superuser();
select tests.create_user('tpl.apply@example.com') as uid \gset
select tests.tx_world(:'uid') as w \gset
select (:'w'::jsonb ->> 'bank') as bank, (:'w'::jsonb ->> 'card') as card, (:'w'::jsonb ->> 'cash') as cash, (:'w'::jsonb ->> 'shop') as shop,
       (:'w'::jsonb ->> 'ravi') as ravi, (:'w'::jsonb ->> 'groceries') as groceries, (:'w'::jsonb ->> 'salary') as salary,
       (:'w'::jsonb ->> 'tag') as tag \gset
select gen_random_uuid() as milk, gen_random_uuid() as rent_plan, gen_random_uuid() as card_plan, gen_random_uuid() as rent_t \gset
select tests.authenticate_as(:'uid');
select tests.apply1(tests.lchange('plan_item', :'rent_plan', 'create', tests.plan_fields('Rent', :'shop', :'bank')));
select tests.apply1(tests.lchange('plan_item', :'card_plan', 'create', tests.plan_fields('Card bill', null, :'bank', null, null,
         jsonb_build_object('target', 'card', 'cardAccountId', :'card', 'payeeId', null, 'amountVaries', true))));

-- ---------------------------------------------------------------- create, shape, references
select is(tests.outcome(tests.lchange('template', :'milk', 'create', tests.tpl_fields('Milk', 'expense', :'cash'::uuid, '6000',
            jsonb_build_object('payeeId', :'shop', 'categoryId', :'groceries', 'tagIds', jsonb_build_array(:'tag'))))), 'applied',
          'an expense template is created');
select is((select flow::text || ' ' || amount_minor::text from public.transaction_templates where id = :'milk'), 'out 6000',
          'its direction is derived and its amount stored in paise');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('Groceries', 'expense', :'bank'::uuid, null))),
          'applied', 'a template without an amount ("amount each time") is created');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('Wallet', 'transfer', :'bank'::uuid, '50000',
            jsonb_build_object('toAccountId', :'cash')))), 'applied', 'a transfer template is created');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('Bad', 'transfer', :'bank'::uuid, '1',
            jsonb_build_object('toAccountId', :'bank')))), 'VALIDATION_FAILED', 'a transfer needs two different accounts');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('Bad', 'person', :'bank'::uuid, '1',
            jsonb_build_object('payeeId', :'shop', 'personAction', 'repaid_to')))), 'INVALID_TEMPLATE', 'a person movement needs a person');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('Bad', 'person', :'bank'::uuid, '1',
            jsonb_build_object('payeeId', :'ravi', 'personAction', 'adjustment')))), 'INVALID_TEMPLATE', 'adjustments are not templates');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('Bad', 'expense', :'bank'::uuid, '1',
            jsonb_build_object('categoryId', :'salary')))), 'INVALID_TEMPLATE', 'the category must match the kind');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('Split', 'expense', :'bank'::uuid, '6000',
            jsonb_build_object('lines', jsonb_build_array(
              jsonb_build_object('id', gen_random_uuid(), 'amountMinor', '4000', 'categoryId', :'groceries'),
              jsonb_build_object('id', gen_random_uuid(), 'amountMinor', '1000', 'categoryId', :'groceries')))))),
          'INVALID_TEMPLATE', 'split lines must add up to the amount');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('milk', 'expense', :'cash'::uuid))),
          'NAME_TAKEN', 'names are unique ignoring case');

-- ---------------------------------------------------------------- the tie (R8-04)
select is(tests.outcome(tests.lchange('template', :'rent_t', 'create', tests.tpl_fields('Rent', 'expense', :'bank'::uuid, '2500000',
            jsonb_build_object('payeeId', :'shop', 'planItemId', :'rent_plan')))), 'applied', 'a template paying the plan''s payee can be tied to it');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('Card', 'transfer', :'bank'::uuid, '100',
            jsonb_build_object('toAccountId', :'card', 'planItemId', :'card_plan')))), 'applied', 'a transfer into the card can be tied to the card bill');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('Wrong', 'expense', :'bank'::uuid, '100',
            jsonb_build_object('planItemId', :'card_plan')))), 'INVALID_TEMPLATE', 'a template that does not pay that way cannot be tied');

-- ---------------------------------------------------------------- updates, merge, hide, order, delete
select is(tests.outcome(tests.lchange('template', :'milk', 'update', '{"amountMinor":"7000"}')), 'VALIDATION_FAILED',
          'the amount and the split lines change together');
select is(tests.outcome(tests.lchange('template', :'milk', 'update', '{"amountMinor":"7000","lines":[]}')), 'applied', 'the amount changes');
select is((tests.apply1(tests.hchange('template', :'milk', 'update', '{"name":"Old milk"}', tests.hlc_at(0))) -> 'ignoredFields'),
          '["name"]'::jsonb, 'an older edit loses to a newer one (per field)');
select tests.apply1(tests.lchange('template', :'milk', 'update', '{"hidden":true}'));
select tests.apply1(tests.lchange('template', :'milk', 'update', '{"sortKey":"Zz"}'));
select is(tests.outcome(tests.lchange('template', :'milk', 'delete')), 'applied', 'a template is deleted');

select tests.as_superuser();
select is((select array_agg(distinct action::text order by action::text) from public.audit_events
            where target_type = 'template' and details ->> 'ownerId' = :'uid'),
          array['template_created', 'template_deleted', 'template_edited', 'template_hidden', 'template_reordered'],
          'history names creating, editing, hiding, reordering and deleting');

-- ---------------------------------------------------------------- the limit
insert into public.transaction_templates (id, user_id, name, kind, flow, account_id, amount_minor, sort_key, server_seq)
select gen_random_uuid(), :'uid', 'Bulk ' || n, 'expense', 'out', :'bank', 100, 'b' || n, 0 from generate_series(1, 96) n; -- 4 live already: 100 in all
select tests.authenticate_as(:'uid');
select is(tests.outcome(tests.lchange('template', gen_random_uuid(), 'create', tests.tpl_fields('One too many', 'expense', :'bank'::uuid))),
          'LIMIT_REACHED', 'at most 100 live templates');

select * from finish();
rollback;
