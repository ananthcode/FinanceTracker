-- T063 Per-email lockout (FR-009): 5 consecutive failures since the last success → 15 minutes.
begin;
select plan(11);
select tests.as_superuser();

select tests.create_user('lock.test@example.com') as uid \gset

-- Failures 1–4: not locked.
select is((app.register_failed_sign_in('lock.test@example.com') ->> 'locked')::boolean, false, 'failure 1 does not lock');
select app.register_failed_sign_in('Lock.Test@Example.com'); -- case-insensitive, same counter
select app.register_failed_sign_in('lock.test@example.com');
select is((app.register_failed_sign_in('lock.test@example.com') ->> 'locked')::boolean, false, 'failure 4 does not lock');

-- Failure 5 locks for 15 minutes.
select is((app.register_failed_sign_in('lock.test@example.com') ->> 'locked')::boolean, true, 'failure 5 locks');
select ok((select locked_until between now() + interval '14 minutes' and now() + interval '16 minutes'
             from private.sign_in_attempts where email = 'lock.test@example.com'),
          'lock lasts 15 minutes');
select ok((app.sign_in_lock_status('lock.test@example.com') ->> 'retryAfter')::int between 840 and 900,
          'lock status reports seconds until retry');

-- The token hook refuses the locked email.
select is(app.hook_custom_access_token(jsonb_build_object('user_id', :'uid', 'authentication_method', 'password',
            'claims', '{}'::jsonb)) -> 'error' ->> 'message', 'LOCKED', 'token hook refuses while locked');

-- Audit: failures and the lock are recorded against the user (visible to them — FR-039).
select is((select count(*)::int from public.audit_events where actor_id = :'uid' and action = 'sign_in_failed'), 5,
          'each failure is audited');
select is((select count(*)::int from public.audit_events where actor_id = :'uid' and action = 'sign_in_locked'), 1,
          'the lock is audited once');

-- A success clears the counter.
select app.clear_failed_sign_ins('lock.test@example.com');
select is((app.sign_in_lock_status('lock.test@example.com') ->> 'locked')::boolean, false, 'success clears the lock');

-- After a lock expires, counting starts again from one.
insert into private.sign_in_attempts (email, failed_count, first_failed_at, locked_until)
values ('lock.test@example.com', 5, now() - interval '20 minutes', now() - interval '5 minutes')
on conflict (email) do update set failed_count = 5, locked_until = now() - interval '5 minutes';
select is((app.register_failed_sign_in('lock.test@example.com') ->> 'locked')::boolean, false,
          'first failure after an expired lock does not re-lock');

-- Functions are server-only.
select tests.authenticate_as(:'uid');
select throws_ok($$ select app.register_failed_sign_in('lock.test@example.com') $$, '42501', null,
                 'clients cannot call the lockout functions');

select * from finish();
rollback;
