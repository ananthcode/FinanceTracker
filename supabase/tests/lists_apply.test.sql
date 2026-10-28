-- T022, T036, T044, T055, T061 Category, payee, person and tag rules in app.apply_changes
-- (R3 contracts/database.md, data-model.md; FR-001–FR-025).
begin;
select plan(45);

select tests.as_superuser();
select tests.create_user('lists.apply@example.com') as asha_id \gset
select gen_random_uuid() as edu \gset
select gen_random_uuid() as kids \gset
select gen_random_uuid() as swim \gset
select gen_random_uuid() as transport \gset
select gen_random_uuid() as fuel \gset
select gen_random_uuid() as salary \gset
select gen_random_uuid() as shop \gset
select gen_random_uuid() as ravi \gset
select gen_random_uuid() as tag \gset

select tests.authenticate_as(:'asha_id');

-- ---------------------------------------------------------------- categories (T022)
select is(tests.outcome(tests.lchange('category', :'edu', 'create', tests.category_fields('Education'))), 'applied',
          'a top-level category is created');
select is(tests.outcome(tests.lchange('category', :'kids', 'create', tests.category_fields('Kids', 'expense', :'edu'))),
          'applied', 'a sub-category of the same kind is created');
select is(tests.outcome(tests.lchange('category', :'swim', 'create', tests.category_fields('Swimming', 'expense', :'kids'))),
          'applied', 'categories nest with no fixed depth');
select is(tests.outcome(tests.lchange('category', :'salary', 'create', tests.category_fields('Salary', 'income'))), 'applied',
          'an income category is created');
select is(tests.outcome(tests.lchange('category', gen_random_uuid(), 'create', tests.category_fields('Bonus', 'income', :'edu'))),
          'INVALID_MOVE', 'a parent of the other kind is refused');
select is(tests.outcome(tests.lchange('category', gen_random_uuid(), 'create', tests.category_fields('kids', 'expense', :'edu'))),
          'NAME_TAKEN', 'a sibling with the same name (any case) is refused');
select is(tests.apply1(tests.lchange('category', gen_random_uuid(), 'create', tests.category_fields('KIDS', 'expense', :'edu'),
            '{"onNameConflict":"suffix"}')) ->> 'renamedTo', 'KIDS (2)', 'a synced sibling clash is suffixed');
select is(tests.outcome(tests.lchange('category', gen_random_uuid(), 'create', tests.category_fields('Kids'))), 'applied',
          'the same name under a different parent is allowed');
select is(tests.outcome(tests.lchange('category', :'edu', 'update', jsonb_build_object('parentId', :'swim'))), 'INVALID_MOVE',
          'moving a category under its own descendant is refused');
select is(tests.outcome(tests.lchange('category', :'edu', 'update', jsonb_build_object('parentId', :'edu'))), 'INVALID_MOVE',
          'moving a category under itself is refused');
select is(tests.outcome(tests.lchange('category', :'kids', 'update', '{"parentId":null}')), 'NAME_TAKEN',
          'moving next to a same-named sibling is refused');
select is(tests.outcome(tests.lchange('category', :'swim', 'update', '{"parentId":null}')), 'applied',
          'a category moves to the top level');
select is((select parent_id from public.categories where id = :'swim'), null, 'the move is stored');
select is(tests.outcome(tests.lchange('category', :'swim', 'update', jsonb_build_object('parentId', :'kids'))), 'applied',
          'a category moves under another of the same kind');
select is(tests.outcome(tests.lchange('category', :'edu', 'update', '{"kind":"income"}')), 'VALIDATION_FAILED',
          'the kind cannot be updated');
select is(tests.outcome(tests.lchange('category', :'kids', 'update', '{"name":"Children","icon":"baby","hidden":true}')),
          'applied', 'name, icon and hidden are updated');
select is((select name || '/' || icon || '/' || hidden from public.categories where id = :'kids'), 'Children/baby/true',
          'the update is stored');
select is(tests.outcome(tests.lchange('category', gen_random_uuid(), 'update', '{"name":"Ghost"}')), 'NOT_FOUND',
          'updating a missing category reports NOT_FOUND');

-- ---------------------------------------------------------------- payees (T036)
select is(tests.outcome(tests.lchange('payee', :'shop', 'create',
            tests.business_fields('Fresh Mart', jsonb_build_object('defaultCategoryId', :'kids', 'notes', 'Weekly')))), 'applied',
          'a business with a default category and notes is created');
select is(tests.outcome(tests.lchange('payee', gen_random_uuid(), 'create', tests.business_fields('fresh mart'))), 'NAME_TAKEN',
          'payee names are unique ignoring case');
select is(tests.apply1(tests.lchange('payee', gen_random_uuid(), 'create', tests.business_fields('Fresh Mart'),
            '{"onNameConflict":"suffix"}')) ->> 'renamedTo', 'Fresh Mart (2)', 'a synced payee clash is suffixed');
select is(tests.outcome(tests.lchange('payee', gen_random_uuid(), 'create',
            tests.business_fields('Shop', '{"openingBalanceMinor":"100"}'))), 'VALIDATION_FAILED',
          'a business cannot carry an opening balance');
select is(tests.outcome(tests.lchange('payee', gen_random_uuid(), 'create',
            tests.business_fields('Shop', jsonb_build_object('defaultCategoryId', gen_random_uuid())))), 'VALIDATION_FAILED',
          'a default category must exist');

-- ---------------------------------------------------------------- people (T044)
select is(tests.outcome(tests.lchange('payee', :'ravi', 'create', tests.person_fields('Ravi Kumar', '1500000'))), 'applied',
          'a person with an opening balance is created');
select is(tests.outcome(tests.lchange('payee', gen_random_uuid(), 'create', '{"name":"No date","kind":"person"}')),
          'VALIDATION_FAILED', 'a person needs an opening-balance date');
select is(tests.outcome(tests.lchange('payee', gen_random_uuid(), 'create',
            tests.person_fields('Future', '0', jsonb_build_object('openingBalanceDate', (current_date + 2)::text)))),
          'DATE_IN_FUTURE', 'an opening date in the future is refused');
select is(tests.outcome(tests.lchange('payee', :'ravi', 'update', '{"kind":"business"}')), 'BALANCE_NOT_ZERO',
          'a person with a balance cannot become a business');
select is(tests.outcome(tests.lchange('payee', :'ravi', 'update', '{"openingBalanceMinor":"0","includeInNetWorth":true}')),
          'applied', 'the balance and the net-worth switch are updated');
select is(tests.outcome(tests.lchange('payee', :'ravi', 'update', '{"kind":"business"}')), 'applied',
          'a settled person becomes a business');
select is((select row(opening_balance_minor, opening_balance_date, include_in_net_worth)::text from public.payees where id = :'ravi'),
          '(0,,f)', 'becoming a business clears the opening fields and the net-worth switch');
select is(tests.outcome(tests.lchange('payee', :'ravi', 'update', '{"kind":"person"}')), 'VALIDATION_FAILED',
          'a business becomes a person only with an opening date');
select is(tests.outcome(tests.lchange('payee', :'ravi', 'update', '{"kind":"person","openingBalanceDate":"2026-04-01"}')),
          'applied', 'a business becomes a person at ₹0.00 with a date');
select is(tests.outcome(tests.lchange('payee', gen_random_uuid(), 'create', tests.person_fields('Max', '999999999999'))),
          'applied', 'the maximum balance is accepted');
select is(tests.outcome(tests.lchange('payee', gen_random_uuid(), 'create', tests.person_fields('Too much', '1000000000000'))),
          'VALIDATION_FAILED', 'a balance beyond the maximum is refused');

-- ---------------------------------------------------------------- tags (T055)
select is(tests.outcome(tests.lchange('tag', :'tag', 'create', '{"name":"Goa trip"}')), 'applied', 'a tag is created');
select is(tests.outcome(tests.lchange('tag', gen_random_uuid(), 'create', '{"name":"GOA TRIP"}')), 'NAME_TAKEN',
          'tag names are unique ignoring case');
select is(tests.outcome(tests.lchange('tag', :'tag', 'update', '{"name":"Goa trip 2026"}')), 'applied', 'a tag is renamed');
select is(tests.outcome(tests.lchange('tag', :'tag', 'delete')), 'applied', 'a tag is deleted');
select is(tests.outcome(tests.lchange('tag', gen_random_uuid(), 'create', '{"name":"Goa trip 2026"}')), 'applied',
          'a deleted tag''s name is free again');

-- ---------------------------------------------------------------- delete rules (T061)
select is(tests.outcome(tests.lchange('category', :'kids', 'delete')), 'HAS_SUBCATEGORIES',
          'a category with sub-categories cannot be deleted');
select is(tests.outcome(tests.lchange('category', :'swim', 'delete')), 'applied', 'a never-used leaf category is deleted');
select is(tests.outcome(tests.lchange('category', :'kids', 'delete')), 'applied', 'once empty, its parent can be deleted');
select is((select default_category_id from public.payees where id = :'shop'), null,
          'payees lose a deleted category as their default');
select is(tests.outcome(tests.lchange('category', :'kids', 'update', '{"name":"Back"}')), 'NOT_FOUND',
          'a deleted category cannot be edited');

-- ---------------------------------------------------------------- limits
select tests.as_superuser();
insert into public.tags (id, user_id, name, server_seq)
  select gen_random_uuid(), :'asha_id', 'Bulk ' || g, 0 from generate_series(1, 499) g;
select tests.authenticate_as(:'asha_id');
select is(tests.outcome(tests.lchange('tag', gen_random_uuid(), 'create', '{"name":"One too many"}')), 'LIMIT_REACHED',
          'the 501st tag is refused');

select * from finish();
rollback;
