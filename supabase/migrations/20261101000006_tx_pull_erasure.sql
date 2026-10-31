-- T015 Pull also returns transactions and person rates (R4 contracts/sync-protocol.md §Pull).
-- As 20261028000007_lists_pull.sql with two more entities. SECURITY INVOKER.

create or replace function app.pull_changes(p_cursor bigint, p_limit int default 500)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 500), 1), 500);
  v_total int;
  v_cursor bigint;
  v_rows  jsonb;
begin
  if v_user is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  if p_cursor is null or p_cursor < 0 then
    raise exception 'VALIDATION_FAILED';
  end if;

  with changed as (
    select u.entity, u.server_seq, u.row
      from (select 'account'::text as entity, a.server_seq, to_jsonb(a) as row
              from public.accounts a where a.user_id = v_user and a.server_seq > p_cursor
            union all
            select 'account_group', g.server_seq, to_jsonb(g)
              from public.account_groups g where g.user_id = v_user and g.server_seq > p_cursor
            union all
            select 'category', c.server_seq, to_jsonb(c)
              from public.categories c where c.user_id = v_user and c.server_seq > p_cursor
            union all
            select 'tag', t.server_seq, to_jsonb(t)
              from public.tags t where t.user_id = v_user and t.server_seq > p_cursor
            union all
            select 'payee', p.server_seq, to_jsonb(p)
              from public.payees p where p.user_id = v_user and p.server_seq > p_cursor
            union all
            select 'transaction', t.server_seq, to_jsonb(t)
              from public.transactions t where t.user_id = v_user and t.server_seq > p_cursor
            union all
            select 'person_rate', r.server_seq, to_jsonb(r)
              from public.person_rates r where r.user_id = v_user and r.server_seq > p_cursor) u
     order by u.server_seq
     limit v_limit + 1
  ), page as (
    select c.*, row_number() over (order by c.server_seq) as rn from changed c
  )
  select count(*)::int,
         max(p.server_seq) filter (where p.rn <= v_limit),
         jsonb_build_object(
           'account', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'account' and p.rn <= v_limit), '[]'::jsonb),
           'account_group', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'account_group' and p.rn <= v_limit), '[]'::jsonb),
           'category', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'category' and p.rn <= v_limit), '[]'::jsonb),
           'tag', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'tag' and p.rn <= v_limit), '[]'::jsonb),
           'payee', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'payee' and p.rn <= v_limit), '[]'::jsonb),
           'transaction', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'transaction' and p.rn <= v_limit), '[]'::jsonb),
           'person_rate', coalesce(jsonb_agg(p.row order by p.server_seq) filter (where p.entity = 'person_rate' and p.rn <= v_limit), '[]'::jsonb))
    into v_total, v_cursor, v_rows
    from page p;

  return jsonb_build_object('cursor', coalesce(v_cursor, p_cursor)::text, 'hasMore', v_total > v_limit, 'rows', v_rows);
end;
$$;

revoke execute on function app.pull_changes(bigint, int) from public, anon;
grant execute on function app.pull_changes(bigint, int) to authenticated;

-- T015 Erasure also deletes the erased user's transaction and person-rate history (FR-022). It holds
-- amounts, notes and names, so it is deleted rather than scrubbed; the rows go by cascade with the auth
-- user. Otherwise as 20261028000008_lists_erasure.sql.

create or replace function app.scrub_user_from_audit(p_user uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(p_email);
  v_ref text := 'erased:' || gen_random_uuid()::text;
  v_digest text := encode(extensions.digest(lower(p_email), 'sha256'), 'hex');
begin
  if exists (select 1 from public.profiles where user_id = p_user and role = 'owner') then
    raise exception 'CANNOT_TARGET_OWNER';
  end if;

  delete from public.audit_events
   where target_type in ('account', 'account_group', 'category', 'tag', 'payee', 'transaction', 'person_rate')
     and details ->> 'ownerId' = p_user::text;

  update public.audit_events
     set actor_id  = case when actor_id = p_user then null else actor_id end,
         target_id = case when target_id = p_user then null else target_id end,
         actor_ref = case when actor_id = p_user or lower(actor_ref) = v_email then v_ref else actor_ref end,
         target_ref = case when target_id = p_user or lower(target_ref) = v_email then v_ref else target_ref end,
         details   = details - 'emailRef'
   where actor_id = p_user or target_id = p_user
      or lower(actor_ref) = v_email or lower(target_ref) = v_email
      or details ->> 'emailRef' = v_digest;

  delete from public.invitations where email = v_email;
  delete from private.sign_in_attempts where email = v_email;
  delete from private.rate_limits where bucket = 'reset:' || v_digest;
  return v_ref;
end;
$$;
