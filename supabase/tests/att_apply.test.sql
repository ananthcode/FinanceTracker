-- R9 T010 Writes for attachments and warranties (contracts/attachments.md; research R9-02, R9-05).
begin;
select plan(27);

select tests.as_superuser();
select tests.create_user('att.apply@example.com') as uid \gset
select tests.tx_world(:'uid') as w \gset
select (:'w'::jsonb ->> 'bank') as bank \gset
select gen_random_uuid() as tx, gen_random_uuid() as tx2, gen_random_uuid() as a1, gen_random_uuid() as a2,
       gen_random_uuid() as pdf, gen_random_uuid() as missing, gen_random_uuid() as big \gset
select tests.authenticate_as(:'uid');
select tests.apply1(tests.lchange('transaction', :'tx', 'create', tests.tx_fields('expense', :'bank'::uuid, '4500000')));
select tests.apply1(tests.lchange('transaction', :'tx2', 'create', tests.tx_fields('expense', :'bank'::uuid, '100')));
select tests.as_superuser();
select tests.att_object(:'uid', :'a1');
select tests.att_object(:'uid', :'a2');
select tests.att_object(:'uid', :'pdf', 300000, 'application/pdf');
select tests.authenticate_as(:'uid');

-- ---------------------------------------------------------------- attachments: create needs the stored file
select is(tests.outcome(tests.lchange('attachment', :'a1', 'create', tests.att_fields(:'tx'))), 'applied',
          'an attachment whose file is stored is recorded');
select is((select transaction_id::text || ' ' || size_bytes::text from public.attachments where id = :'a1'),
          :'tx' || ' 120000', 'it belongs to the transaction with its size');
select is(tests.outcome(tests.lchange('attachment', :'pdf', 'create', tests.att_fields(:'tx', 'Bill.pdf', 'application/pdf', '300000'))),
          'applied', 'a PDF is recorded');
select is(tests.outcome(tests.lchange('attachment', :'missing', 'create', tests.att_fields(:'tx'))), 'INVALID_ATTACHMENT',
          'no record without its file (FR-007)');
select is(tests.outcome(tests.lchange('attachment', :'a2', 'create', tests.att_fields(:'tx', 'Receipt.jpg', 'image/jpeg', '999'))),
          'INVALID_ATTACHMENT', 'the size must be the stored file''s');
select is(tests.outcome(tests.lchange('attachment', :'a2', 'create', tests.att_fields(:'tx', 'Receipt.png', 'image/png'))),
          'INVALID_ATTACHMENT', 'the type must be the stored file''s');
select is(tests.outcome(tests.lchange('attachment', :'a2', 'create', tests.att_fields(:'tx', 'Notes.docx', 'application/msword'))),
          'INVALID_ATTACHMENT', 'only photos and PDFs');
select is(tests.outcome(tests.lchange('attachment', :'a2', 'create', tests.att_fields(:'tx', ' padded '))),
          'INVALID_ATTACHMENT', 'the name is trimmed text');
select is(tests.outcome(tests.lchange('attachment', :'a2', 'create', tests.att_fields(:'tx') || '{"sizeBytes": 120000}')),
          'INVALID_ATTACHMENT', 'the size is a decimal string');
select is(tests.outcome(tests.lchange('attachment', :'a1', 'create', tests.att_fields(:'tx'))), 'applied',
          'a replayed create for the same file merges');

-- ---------------------------------------------------------------- rename, delete
select is(tests.outcome(tests.lchange('attachment', :'a1', 'update', '{"name":"Fridge receipt.jpg"}')), 'applied',
          'an attachment is renamed');
select is(tests.outcome(tests.lchange('attachment', :'a1', 'update', '{"sizeBytes":"1"}')), 'VALIDATION_FAILED',
          'the file never changes');
select is(tests.outcome(tests.lchange('attachment', :'pdf', 'delete')), 'applied', 'an attachment is deleted');
select is(app.my_orphan_attachment_files(), :'uid' || '/' || :'pdf', 'its file is now listed for clean-up');

-- ---------------------------------------------------------------- limits
select tests.as_superuser();
insert into public.attachments (id, user_id, transaction_id, name, content_type, size_bytes, server_seq)
select gen_random_uuid(), :'uid', :'tx2', 'Bulk ' || n, 'image/jpeg', 100, 0 from generate_series(1, 10) n;
select tests.att_object(:'uid', :'big', 10485760);
select tests.authenticate_as(:'uid');
select is(tests.outcome(tests.lchange('attachment', :'a2', 'create', tests.att_fields(:'tx2'))), 'LIMIT_REACHED',
          'at most 10 attachments on a transaction');
select tests.as_superuser();
insert into storage.objects (bucket_id, name, owner, metadata)
select 'attachments', :'uid' || '/' || gen_random_uuid(), :'uid', '{"size": 10485760, "mimetype": "application/pdf"}'
  from generate_series(1, 19);
select tests.authenticate_as(:'uid');
select is(tests.outcome(tests.lchange('attachment', :'big', 'create', tests.att_fields(:'tx', 'Big.jpg', 'image/jpeg', '10485760'))),
          'QUOTA_EXCEEDED', 'stored files stay within 200 MB (clarify Q1)');
select is(app.my_attachment_usage() ->> 'files', '23', 'usage counts the stored files');

-- ---------------------------------------------------------------- a deleted transaction takes its attachments
select is(tests.outcome(tests.lchange('transaction', :'tx', 'delete')), 'applied', 'the transaction is deleted');
select is((select count(*)::int from public.attachments where transaction_id = :'tx' and state = 'active'), 0,
          'its attachments are deleted with it (clarify Q2)');
select is(tests.outcome(tests.lchange('attachment', gen_random_uuid(), 'create', tests.att_fields(:'tx'))), 'INVALID_ATTACHMENT',
          'nothing can be attached to a deleted transaction');

-- ---------------------------------------------------------------- warranty fields (R9-05)
select is(tests.outcome(tests.lchange('transaction', :'tx2', 'update',
            '{"warrantyUntil":"2028-10-05","warrantyNote":"2 years, brand service centre"}')), 'applied', 'a warranty is set');
select is(tests.outcome(tests.lchange('transaction', :'tx2', 'update', '{"warrantyUntil":"2028-10-05"}')), 'INVALID_WARRANTY',
          'the expiry and its note change together');
select is(tests.outcome(tests.lchange('transaction', :'tx2', 'update', '{"warrantyUntil":"2026-10-01","warrantyNote":null}')),
          'INVALID_WARRANTY', 'a warranty cannot end before the purchase');
select is(tests.outcome(tests.lchange('transaction', :'tx2', 'update', '{"warrantyUntil":null,"warrantyNote":"x"}')),
          'INVALID_WARRANTY', 'a note needs an expiry');
select is(tests.outcome(tests.lchange('transaction', :'tx2', 'update', '{"warrantyDismissed":3}')), 'INVALID_WARRANTY',
          'reminders dismissed are 0, 1 or 2');
select tests.apply1(tests.lchange('transaction', :'tx2', 'update', '{"warrantyDismissed":1}'));
select tests.apply1(tests.lchange('transaction', :'tx2', 'update', '{"warrantyUntil":"2029-10-05","warrantyNote":null}'));
select is((select warranty_until::text || ' ' || warranty_dismissed::text || ' ' || coalesce(warranty_note, '-')
             from public.transactions where id = :'tx2'), '2029-10-05 0 -', 'a new expiry starts its reminders again');

select tests.as_superuser();
select is((select array_agg(distinct action::text order by action::text) from public.audit_events
            where target_type = 'attachment' and details ->> 'ownerId' = :'uid'),
          array['attachment_created', 'attachment_deleted', 'attachment_edited'],
          'history names adding, renaming and deleting attachments');

select * from finish();
rollback;
