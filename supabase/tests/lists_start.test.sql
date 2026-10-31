-- T023 The one-time start choice for the default categories (FR-007, research R3-06; SC-008).
begin;
select plan(12);

select tests.as_superuser();
select tests.create_user('lists.start.a@example.com') as asha_id \gset
select tests.create_user('lists.start.b@example.com') as ravi_id \gset
-- A small default tree in the shape packages/core sends (two levels).
select '[{"name":"Food","kind":"expense","colour":"green","icon":"utensils","children":[{"name":"Groceries","colour":"green","icon":"shopping-cart"},{"name":"Eating out"}]},
         {"name":"Salary","kind":"income","colour":"teal","icon":"briefcase","children":[]}]' as defaults \gset

select tests.authenticate_as(:'asha_id');
select is(app.start_categories('suggested', :'defaults'::jsonb), '{"choice":"suggested","added":4}'::jsonb,
          'suggested adds the default tree');
select is((select count(*)::int from public.categories), 4, 'the defaults are stored');
select is((select p.icon from public.categories p where p.name = 'Eating out'), 'utensils',
          'a child without its own icon takes its parent''s');
select is((select c.parent_id from public.categories c where c.name = 'Groceries'),
          (select c.id from public.categories c where c.name = 'Food'), 'children sit under their parent');
select is(app.start_categories('suggested', :'defaults'::jsonb), '{"choice":"suggested","added":0}'::jsonb,
          'a second call adds nothing (never twice)');
select is(app.start_categories('empty', :'defaults'::jsonb) ->> 'choice', 'suggested', 'the first answer is kept');

select throws_ok($$ update public.user_preferences set categories_start = 'empty' $$, '42501', null,
                 'clients cannot set the start choice directly');

select tests.authenticate_as(:'ravi_id');
select is(app.start_categories('empty', :'defaults'::jsonb), '{"choice":"empty","added":0}'::jsonb, 'empty adds nothing');
select is(app.start_categories('suggested', :'defaults'::jsonb), '{"choice":"empty","added":4}'::jsonb,
          '"Add suggested categories" works while the user has none, keeping the first answer');
select is((select count(*)::int from public.categories), 4, 'only the caller''s categories are visible');

select tests.as_superuser();
select is((select count(*)::int from public.categories where user_id = :'asha_id'), 4, 'the other user is untouched');
select throws_ok($$ select app.start_categories('suggested', '[{"name":"x"}]'::jsonb) $$, 'P0001', 'USER_INACTIVE',
                 'without a signed-in user nothing happens');

select * from finish();
rollback;
