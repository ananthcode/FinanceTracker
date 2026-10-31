-- R4 T045 Relocate, and R3 merges / tag delete reaching transactions (FR-019, FR-021; US6 4).
begin;
select plan(16);

select tests.as_superuser();
select tests.create_user('tx.relocate@example.com') as asha_id \gset
select tests.create_user('tx.relocate.other@example.com') as other_id \gset
select tests.tx_world(:'asha_id') as w \gset
select (:'w'::jsonb ->> 'bank') as bank, (:'w'::jsonb ->> 'salary') as salary, (:'w'::jsonb ->> 'shop') as shop,
       (:'w'::jsonb ->> 'ravi') as ravi, (:'w'::jsonb ->> 'tag') as tag \gset
select gen_random_uuid() as snacks \gset
select gen_random_uuid() as treats \gset
select gen_random_uuid() as old_snacks \gset
select gen_random_uuid() as freshmart \gset
select gen_random_uuid() as fresh2 \gset
select gen_random_uuid() as tag2 \gset
select gen_random_uuid() as t1 \gset
select gen_random_uuid() as t2 \gset
select gen_random_uuid() as t3 \gset
select gen_random_uuid() as t4 \gset

select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.lchange('category', :'snacks', 'create', tests.category_fields('Snacks')));
select tests.apply1(tests.lchange('category', :'treats', 'create', tests.category_fields('Treats')));
select tests.apply1(tests.lchange('category', :'old_snacks', 'create', tests.category_fields('Old snacks')));
select tests.apply1(tests.lchange('payee', :'freshmart', 'create', tests.business_fields('FreshMart')));
select tests.apply1(tests.lchange('payee', :'fresh2', 'create', tests.business_fields('Fresh-Mart')));
select tests.apply1(tests.lchange('tag', :'tag2', 'create', '{"name":"Festival"}'));
-- t1: Snacks, FreshMart, both tags; t2: split with a Snacks line tagged Diwali; t3: Old snacks; t4: Fresh-Mart
select tests.apply1(tests.lchange('transaction', :'t1', 'create', tests.tx_fields('expense', :'bank', '1000',
         jsonb_build_object('categoryId', :'snacks', 'payeeId', :'freshmart', 'tagIds', jsonb_build_array(:'tag', :'tag2')))));
select tests.apply1(tests.lchange('transaction', :'t2', 'create', tests.tx_fields('expense', :'bank', '300',
         jsonb_build_object('lines', jsonb_build_array(
           jsonb_build_object('id', gen_random_uuid(), 'amountMinor', '100', 'categoryId', :'snacks', 'tagIds', jsonb_build_array(:'tag2')),
           jsonb_build_object('id', gen_random_uuid(), 'amountMinor', '200', 'categoryId', :'treats'))))));
select tests.apply1(tests.lchange('transaction', :'t3', 'create', tests.tx_fields('expense', :'bank', '50', jsonb_build_object('categoryId', :'old_snacks'))));
select tests.apply1(tests.lchange('transaction', :'t4', 'create', tests.tx_fields('expense', :'bank', '70', jsonb_build_object('payeeId', :'fresh2'))));

-- ---------------------------------------------------------------- relocate category
select is(tests.outcome(tests.lchange('category', :'snacks', 'relocate', jsonb_build_object('targetId', :'salary'))), 'INVALID_MERGE',
          'relocating to a category of the other kind is refused');
select is(tests.outcome(tests.lchange('category', :'snacks', 'relocate', jsonb_build_object('targetId', :'snacks'))), 'INVALID_MERGE',
          'relocating to itself is refused');
select is(tests.outcome(tests.lchange('category', :'snacks', 'relocate', jsonb_build_object('targetId', :'treats'))), 'applied',
          'US6 4: relocate Snacks → Treats');
select is((select category_id from public.transactions where id = :'t1'), :'treats'::uuid, 'the transaction moved');
select ok((select bool_and(l ->> 'categoryId' = :'treats') from public.transactions t, jsonb_array_elements(t.lines) l where t.id = :'t2'),
          'and its split line moved');
select is((select state::text from public.categories where id = :'snacks'), 'active', 'the source stays');
select tests.as_superuser();
select is((select count(*)::int from public.audit_events where action = 'category_relocated' and target_id = :'snacks'), 1,
          'the relocation is in the history');
select tests.authenticate_as(:'asha_id');

-- ---------------------------------------------------------------- relocate payee
select is(tests.outcome(tests.lchange('payee', :'freshmart', 'relocate', jsonb_build_object('targetId', :'ravi'))), 'INVALID_MERGE',
          'a business cannot be relocated to a person');
select is(tests.outcome(tests.lchange('payee', :'freshmart', 'relocate', jsonb_build_object('targetId', :'shop'))), 'applied',
          'US6 4: relocate FreshMart → the shop');
select is((select payee_id::text || ' ' || (select state::text from public.payees where id = :'freshmart') from public.transactions where id = :'t1'),
          :'shop' || ' active', 'its transactions moved; the source stays');

-- ---------------------------------------------------------------- R3 merges now move transactions
select is(tests.outcome(tests.lchange('category', :'old_snacks', 'merge', jsonb_build_object('targetId', :'treats'))), 'applied', 'merge a category');
select is((select category_id from public.transactions where id = :'t3'), :'treats'::uuid, 'a merged category''s transactions move to the target');
select tests.apply1(tests.lchange('payee', :'fresh2', 'merge', jsonb_build_object('targetId', :'shop')));
select is((select payee_id from public.transactions where id = :'t4'), :'shop'::uuid, 'a merged payee''s transactions move to the target');

-- ---------------------------------------------------------------- tags
select tests.apply1(tests.lchange('tag', :'tag2', 'merge', jsonb_build_object('targetId', :'tag')));
select is((select tag_ids from public.transactions where id = :'t1'), array[:'tag'::uuid], 'a merged tag is replaced, never twice');
select tests.apply1(tests.lchange('tag', :'tag', 'delete'));
select is((select cardinality(tag_ids) from public.transactions where id = :'t1'), 0, 'FR-021: a deleted tag leaves its transactions');
select is((select count(*)::int from public.transactions t, jsonb_array_elements(t.lines) l
            where t.id = :'t2' and jsonb_array_length(l -> 'tagIds') > 0), 0, 'and their split lines');

select * from finish();
rollback;
