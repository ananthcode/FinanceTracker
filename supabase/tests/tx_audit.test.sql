-- R4 T006 Transaction history (FR-022; SC-005).
begin;
select plan(7);

select tests.as_superuser();
select tests.create_user('tx.audit@example.com') as asha_id \gset
select tests.tx_world(:'asha_id') as w \gset
select gen_random_uuid() as tx \gset
select gen_random_uuid() as rate \gset

select tests.authenticate_as(:'asha_id');
select tests.apply1(tests.lchange('transaction', :'tx', 'create',
                    tests.tx_fields('expense', (:'w'::jsonb ->> 'bank')::uuid, '2500000', jsonb_build_object('date', (current_date + 3)::text))), 'android');
select tests.apply1(tests.lchange('transaction', :'tx', 'update', jsonb_build_object('date', current_date::text, 'notes', 'Rent')));
select tests.apply1(tests.lchange('transaction', :'tx', 'update', '{"confirmed":true}'));
select tests.apply1(tests.lchange('transaction', :'tx', 'delete'));
select tests.apply1(tests.lchange('person_rate', :'rate', 'create',
                    jsonb_build_object('payeeId', :'w'::jsonb ->> 'ravi', 'effectiveMonth', '2026-04-01', 'rateE4', 15000)));
select tests.apply1(tests.lchange('person_rate', :'rate', 'update', '{"rateE4":10000}'));

select tests.as_superuser();
create temp table actions as
  select target_id, action::text as action, device_type, details from public.audit_events
   where target_type in ('transaction', 'person_rate') and details ->> 'ownerId' = :'asha_id' order by occurred_at, id;

select is((select array_agg(action order by details ->> 'hlc') from actions where target_id = :'tx'),
          array['transaction_created', 'transaction_edited', 'transaction_confirmed', 'transaction_deleted'],
          'a transaction''s life: created, edited, confirmed, deleted');
select is((select device_type::text from actions where target_id = :'tx' and action = 'transaction_created'), 'android',
          'the device type is recorded');
select is((select details -> 'changes' -> 'amount_minor' ->> 'after' from actions where action = 'transaction_created'), '2500000',
          'the amount is recorded');
select is((select details -> 'changes' -> 'notes' from actions where action = 'transaction_edited'),
          '{"before":null,"after":"Rent"}'::jsonb, 'an edit records before and after');
select is((select array_agg(action order by details ->> 'hlc') from actions where target_id = :'rate'),
          array['person_rate_created', 'person_rate_edited'], 'rates: created, edited');
select ok((select bool_and(details ? 'changeId') from actions), 'every row records its change id');
select is((select count(*)::int from public.audit_events where target_type = 'transaction' and details -> 'changes' ? 'lines'
             and details ->> 'ownerId' = :'asha_id' and action = 'transaction_edited'), 0,
          'unchanged columns are not recorded as changes');

select * from finish();
rollback;
