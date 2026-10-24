-- T078 Preferences (FR-020–FR-025; database rule 9; constitution III).
begin;
select plan(10);
select tests.as_superuser();

select tests.create_user('pref.a@example.com') as a_id \gset
select tests.create_user('pref.b@example.com') as b_id \gset

-- Defaults (FR-020, FR-022).
select results_eq(
  format($$select base_currency::text, number_format::text, date_format::text, fy_start_month::int, timezone
           from public.user_preferences where user_id = %L$$, :'a_id'),
  $$values ('INR', 'indian', 'dd-MMM-yyyy', 4, 'Asia/Kolkata')$$,
  'new users get India-first defaults');

-- Own row only.
select tests.authenticate_as(:'a_id');
update public.user_preferences set number_format = 'international', timezone = 'UTC' where user_id = :'a_id';
update public.user_preferences set number_format = 'international' where user_id = :'b_id';
select tests.as_superuser();
select is((select number_format::text from public.user_preferences where user_id = :'a_id'), 'international',
          'a user can change their own preferences');
select is((select number_format::text from public.user_preferences where user_id = :'b_id'), 'indian',
          'a user cannot change another user''s preferences');

-- Audit with before/after (FR-037, constitution III).
select is((select details -> 'changes' -> 'number_format' ->> 'before' from public.audit_events
            where action = 'preference_changed' and actor_id = :'a_id' order by id desc limit 1),
          'indian', 'preference change records the previous value');
select is((select details -> 'changes' -> 'timezone' ->> 'after' from public.audit_events
            where action = 'preference_changed' and actor_id = :'a_id' order by id desc limit 1),
          'UTC', 'preference change records the new value');

-- Validation.
select tests.authenticate_as(:'a_id');
select throws_ok($$ update public.user_preferences set timezone = 'Mars/Olympus' $$, '22023', 'INVALID_TIMEZONE',
                 'unknown timezones are rejected');
select throws_ok($$ update public.user_preferences set fy_start_month = 13 $$, '23514', null,
                 'financial-year start month must be 1–12');
select throws_ok($$ update public.user_preferences set base_currency = 'rs' $$, '23514', null,
                 'base currency must be an ISO 4217 code');

-- Rule 9: base currency is fixed once setup is complete (FR-021).
update public.user_preferences set base_currency = 'USD';
select tests.as_superuser();
update public.profiles set display_name = 'Pref A', setup_completed_at = now() where user_id = :'a_id';
select tests.authenticate_as(:'a_id');
select throws_ok($$ update public.user_preferences set base_currency = 'EUR' $$, '42501', 'BASE_CURRENCY_LOCKED',
                 'base currency cannot change after setup');
select lives_ok($$ update public.user_preferences set date_format = 'yyyy-MM-dd' $$,
                'other preferences can still change after setup');

select * from finish();
rollback;
