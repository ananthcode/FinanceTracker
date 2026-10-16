-- T024 Isolation suite — contracts/database.md rules 1–6 and 11 (constitution I, SC-003).
begin;
select plan(20);

-- Setup (superuser): owner, two members.
select tests.as_superuser();
select tests.create_user('owner.test@example.com', 'owner') as owner_id \gset
select tests.create_user('asha.test@example.com') as asha_id \gset
select tests.create_user('ravi.test@example.com') as ravi_id \gset

-- ---------------------------------------------------------------- Rule 1: A cannot see/alter B
select tests.authenticate_as(:'asha_id');

select is((select count(*)::int from public.profiles), 1, 'rule 1: a member sees only their own profile');
select is((select count(*)::int from public.profiles where user_id = :'ravi_id'), 0,
          'rule 1: a member cannot read another profile');
select is((select count(*)::int from public.user_preferences where user_id = :'ravi_id'), 0,
          'rule 1: a member cannot read another user''s preferences');

update public.profiles set display_name = 'Hacked' where user_id = :'ravi_id';
update public.user_preferences set timezone = 'UTC' where user_id = :'ravi_id';
select tests.as_superuser();
select is((select display_name from public.profiles where user_id = :'ravi_id'), null,
          'rule 1: a member cannot update another profile');
select is((select timezone from public.user_preferences where user_id = :'ravi_id'), 'Asia/Kolkata',
          'rule 1: a member cannot update another user''s preferences');

-- ---------------------------------------------------------------- Rule 2: owner is not special in RLS
select tests.authenticate_as(:'owner_id');
select is((select count(*)::int from public.user_preferences), 1,
          'rule 2: the owner sees only their own preferences');
select is((select count(*)::int from public.profiles where user_id <> :'owner_id'), 0,
          'rule 2: the owner cannot read other profiles directly');

-- ---------------------------------------------------------------- Rule 3: no client access to invitations/private
select throws_ok($$ select count(*) from public.invitations $$, '42501', null,
                 'rule 3: authenticated cannot read invitations');
select throws_ok($$ select count(*) from private.sign_in_attempts $$, '42501', null,
                 'rule 3: authenticated cannot read private tables');
select tests.authenticate_as(:'asha_id');
select is((select count(*)::int from public.audit_events where actor_id <> :'asha_id'), 0,
          'rule 3: a member cannot read other users'' audit events');

-- ---------------------------------------------------------------- Rule 4: audit is append-only for clients
select throws_ok($$ insert into public.audit_events (action) values ('signed_out') $$, '42501', null,
                 'rule 4: clients cannot insert audit events');
select throws_ok($$ update public.audit_events set actor_ref = 'x' $$, '42501', null,
                 'rule 4: clients cannot update audit events');
select throws_ok($$ delete from public.audit_events $$, '42501', null,
                 'rule 4: clients cannot delete audit events');

-- ---------------------------------------------------------------- Rule 5: disabled user sees nothing
select tests.as_superuser();
update public.profiles set status = 'disabled' where user_id = :'ravi_id';
select tests.authenticate_as(:'ravi_id');
select is((select count(*)::int from public.profiles), 0, 'rule 5: a disabled user reads no profile');
select is((select count(*)::int from public.user_preferences), 0, 'rule 5: a disabled user reads no preferences');

-- ---------------------------------------------------------------- Rule 6: role/status not client-changeable
select tests.authenticate_as(:'asha_id');
select throws_ok($$ update public.profiles set role = 'owner' $$, '42501', null,
                 'rule 6: a member cannot change their role');
select throws_ok($$ update public.profiles set status = 'active' $$, '42501', null,
                 'rule 6: a member cannot change their status');
select throws_ok($$ update public.profiles set setup_completed_at = now() $$, '42501', null,
                 'rule 6: setup completion is server-side only');

-- ---------------------------------------------------------------- Rule 11: private tables unreachable
select throws_ok($$ select * from private.rate_limits $$, '42501', null,
                 'rule 11: rate_limits unreachable for clients');
select tests.as_anon();
select throws_ok($$ select * from private.environment $$, '42501', null,
                 'rule 11: environment unreachable for anon');

select * from finish();
rollback;
