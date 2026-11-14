-- T002 Where attachment files live (specs/009-attachments-warranty research R9-01): one private bucket on
-- the existing project. Object names are `<user_id>/<attachment_id>`.
--
-- REVIEW (constitution workflow — RLS / storage): an active user may read, add and remove objects in their
-- own folder only; nobody may replace one (no update policy). Adding is refused once the folder holds the
-- 200 MB allowance (clarify Q1), so files without records cannot grow past it either. The bucket itself
-- refuses objects over 10 MB and types other than JPEG, PNG, WebP and PDF.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The bytes stored in a user's folder: what the allowance counts (research R9-03).
create or replace function app.attachment_bytes(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
   where o.bucket_id = 'attachments' and o.name like p_user::text || '/%';
$$;

create or replace function app.my_attachment_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select app.attachment_bytes((select auth.uid()));
$$;

revoke execute on function app.attachment_bytes(uuid) from public, anon, authenticated;
revoke execute on function app.my_attachment_bytes() from public, anon;
grant execute on function app.my_attachment_bytes() to authenticated;

-- `<uuid>/<uuid>`: the first folder is the caller; no deeper folders.
create policy attachments_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments'
         and name like (select auth.uid())::text || '/%'
         and (select app.is_active_user()));

create policy attachments_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments'
              and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
              and (select app.is_active_user())
              and (select app.my_attachment_bytes()) < 209715200);

create policy attachments_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments'
         and name like (select auth.uid())::text || '/%'
         and (select app.is_active_user()));
