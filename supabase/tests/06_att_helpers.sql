-- R9 pgTAP helpers for attachments. LOCAL database only.
begin;
select plan(1);

-- A stored file in the attachments bucket, as the Storage API leaves it (superuser; no bytes needed).
create or replace function tests.att_object(p_user uuid, p_id uuid, p_size bigint default 120000,
                                            p_type text default 'image/jpeg', p_age interval default '0')
returns void
language sql
as $$
  insert into storage.objects (bucket_id, name, owner, metadata, created_at)
  values ('attachments', p_user::text || '/' || p_id::text, p_user,
          jsonb_build_object('size', p_size, 'mimetype', p_type), now() - p_age);
$$;

-- An attachment record's fields.
create or replace function tests.att_fields(p_tx uuid, p_name text default 'Receipt.jpg', p_type text default 'image/jpeg',
                                            p_size text default '120000')
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('transactionId', p_tx, 'name', p_name, 'contentType', p_type, 'sizeBytes', p_size);
$$;

grant execute on all functions in schema tests to anon, authenticated;
revoke execute on function tests.att_object(uuid, uuid, bigint, text, interval) from anon, authenticated;

select pass('attachment test helpers installed');
select * from finish();
commit;
