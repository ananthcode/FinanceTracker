-- T008 Importing a backup (specs/010-data-export research R10-05) and recording exports (R10-07).
--
-- REVIEW (constitution workflow — RLS / sync): an import is a short session of the caller's own, opened only
-- into empty data. Every record goes through app._apply_one — the same rules as a push — in chunks of at
-- most 1,000; a refused change rolls its chunk back and the client then aborts, which is the R5 reset (the
-- data was empty, so "nothing imported" is empty again). `import_finish` only marks interest proposals and
-- adds declined-proposal markers on the caller's own rows (the data was empty when the session opened).
-- Nothing here returns or logs record contents.

create table private.imports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  device     text not null check (device in ('web', 'android')),
  state      text not null default 'open' check (state in ('open', 'finished', 'undone')),
  counts     jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);
create unique index imports_one_open on private.imports (user_id) where state = 'open';

-- "Empty data" exactly as the demo load means it (any row, deleted ones included).
create or replace function app._user_data_empty(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not (exists (select 1 from public.accounts where user_id = p_user)
           or exists (select 1 from public.account_groups where user_id = p_user)
           or exists (select 1 from public.categories where user_id = p_user)
           or exists (select 1 from public.tags where user_id = p_user)
           or exists (select 1 from public.payees where user_id = p_user)
           or exists (select 1 from public.transactions where user_id = p_user)
           or exists (select 1 from public.person_rates where user_id = p_user)
           or exists (select 1 from public.plan_items where user_id = p_user)
           or exists (select 1 from public.plan_occurrences where user_id = p_user)
           or exists (select 1 from public.transaction_templates where user_id = p_user)
           or exists (select 1 from public.attachments where user_id = p_user));
$$;

-- The caller's open session, locked; raises IMPORT_NOT_OPEN otherwise.
create or replace function app._my_import(p_import uuid)
returns private.imports
language plpgsql
security definer
set search_path = ''
as $$
declare
  r private.imports%rowtype;
begin
  if auth.uid() is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  select * into r from private.imports i where i.id = p_import and i.user_id = auth.uid() and i.state = 'open' for update;
  if not found then
    raise exception 'IMPORT_NOT_OPEN';
  end if;
  return r;
end;
$$;

create or replace function app.import_begin(p_device text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  if p_device is null or p_device not in ('web', 'android') then
    raise exception 'VALIDATION_FAILED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sync:' || v_user::text, 0));
  if not app._user_data_empty(v_user) then
    raise exception 'NOT_EMPTY';
  end if;
  -- A session left open by an import that was reset away: nothing of it remains.
  update private.imports i set state = 'undone', ended_at = now() where i.user_id = v_user and i.state = 'open';
  insert into private.imports (user_id, device) values (v_user, p_device) returning id into v_id;
  return v_id;
end;
$$;

create or replace function app.import_chunk(p_import uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s        private.imports%rowtype;
  v_change jsonb;
  v_index  integer := 0;
  v_result jsonb;
  v_counts jsonb;
  v_entity text;
begin
  s := app._my_import(p_import);
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 1000 then
    raise exception 'VALIDATION_FAILED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sync:' || s.user_id::text, 0));
  v_counts := s.counts;
  perform set_config('app.device_type', s.device, true);
  for v_change in select e.value from jsonb_array_elements(p_changes) with ordinality e order by e.ordinality loop
    v_result := app._apply_one(s.user_id, v_change, now());
    if v_result ->> 'status' is distinct from 'applied' then
      -- The whole chunk rolls back; the client aborts the session (R10-05).
      raise exception 'IMPORT_REJECTED:%:%', v_index, coalesce(v_result ->> 'code', v_result ->> 'status');
    end if;
    if v_change ->> 'kind' = 'create' then
      v_entity := v_change ->> 'entity';
      v_counts := jsonb_set(v_counts, array[v_entity], to_jsonb(coalesce((v_counts ->> v_entity)::int, 0) + 1));
    end if;
    v_index := v_index + 1;
  end loop;
  perform set_config('app.change_context', '', true);
  perform set_config('app.device_type', '', true);
  update private.imports i set counts = v_counts where i.id = s.id;
  return jsonb_build_object('applied', v_index);
end;
$$;

-- p_interest: { proposals: [{ transactionId, interestMonth, userEdited }], declined: [{ payeeId, month }] }.
create or replace function app.import_finish(p_import uuid, p_interest jsonb, p_categories_start text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s   private.imports%rowtype;
  p   jsonb;
  v_n integer;
begin
  s := app._my_import(p_import);
  if p_categories_start is not null and p_categories_start not in ('suggested', 'empty') then
    raise exception 'VALIDATION_FAILED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sync:' || s.user_id::text, 0));

  -- Restored interest proposals stay proposals, so the proposer does not make them again (R10-05).
  for p in select e.value from jsonb_array_elements(coalesce(p_interest -> 'proposals', '[]'::jsonb)) e loop
    update public.transactions t
       set generated = true, interest_month = (p ->> 'interestMonth')::date,
           user_edited = coalesce((p ->> 'userEdited')::boolean, false)
     where t.id = (p ->> 'transactionId')::uuid and t.user_id = s.user_id and t.kind = 'interest'
       and t.created_at >= s.started_at and extract(day from (p ->> 'interestMonth')::date) = 1;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'VALIDATION_FAILED';
    end if;
  end loop;
  -- Declined proposals: a deleted marker per person and month, as the proposer leaves them.
  insert into public.transactions (id, user_id, date, kind, flow, amount_minor, payee_id, confirmed, generated,
                                   interest_month, state, deleted_at, field_versions)
  select gen_random_uuid(), s.user_id, ((d ->> 'month')::date + interval '1 month' - interval '1 day')::date, 'interest', 'out',
         1, (d ->> 'payeeId')::uuid, false, true, (d ->> 'month')::date, 'deleted', now(), '{}'::jsonb
    from jsonb_array_elements(coalesce(p_interest -> 'declined', '[]'::jsonb)) d
   where extract(day from (d ->> 'month')::date) = 1
     and exists (select 1 from public.payees y where y.id = (d ->> 'payeeId')::uuid and y.user_id = s.user_id and y.kind = 'person')
     and not exists (select 1 from public.transactions t where t.user_id = s.user_id and t.payee_id = (d ->> 'payeeId')::uuid
                       and t.generated and t.interest_month = (d ->> 'month')::date);

  update public.user_preferences u
     set categories_start = coalesce(p_categories_start::public.categories_start,
                                     case when exists (select 1 from public.categories c where c.user_id = s.user_id)
                                          then 'suggested'::public.categories_start end,
                                     u.categories_start)
   where u.user_id = s.user_id;

  update private.imports i set state = 'finished', ended_at = now() where i.id = s.id;
  perform app.write_audit('data_imported'::public.audit_action, auth.uid(), null, 'user', s.user_id, null, s.device,
                          jsonb_build_object('ownerId', s.user_id, 'counts', s.counts));
  return s.counts;
end;
$$;

create or replace function app.import_abort(p_import uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s         private.imports%rowtype;
  v_removed jsonb;
begin
  s := app._my_import(p_import);
  v_removed := app._reset_user_data(s.user_id, s.device);
  update private.imports i set state = 'undone', ended_at = now() where i.id = s.id;
  perform app.write_audit('data_import_undone'::public.audit_action, auth.uid(), null, 'user', s.user_id, null, s.device,
                          jsonb_build_object('ownerId', s.user_id));
  return v_removed;
end;
$$;

create or replace function app.my_open_import()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('importId', i.id, 'startedAt', i.started_at)
    from private.imports i
   where i.user_id = (select auth.uid()) and i.state = 'open' and (select app.is_active_user());
$$;

-- R10-07: an export happened (format, counts, range, with files, locked) — never contents.
create or replace function app.log_export(p_format text, p_counts jsonb, p_from date, p_to date, p_files boolean, p_locked boolean, p_device text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts jsonb;
begin
  if auth.uid() is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  if p_format not in ('backup', 'xlsx', 'csv') or p_device not in ('web', 'android') or jsonb_typeof(p_counts) <> 'object' then
    raise exception 'VALIDATION_FAILED';
  end if;
  -- Only whole numbers by known record type.
  select coalesce(jsonb_object_agg(k, (v #>> '{}')::int), '{}'::jsonb) into v_counts
    from jsonb_each(p_counts) as e(k, v)
   where k in ('account_group', 'account', 'category', 'tag', 'payee', 'person_rate', 'plan_item', 'plan_occurrence',
               'template', 'transaction', 'attachment')
     and jsonb_typeof(v) = 'number';
  perform app.write_audit('data_exported'::public.audit_action, auth.uid(), null, 'user', auth.uid(), null, p_device,
                          jsonb_build_object('ownerId', auth.uid(), 'format', p_format, 'counts', v_counts,
                                             'from', p_from, 'to', p_to, 'files', coalesce(p_files, false),
                                             'locked', coalesce(p_locked, false)));
end;
$$;

revoke execute on function app._user_data_empty(uuid) from public, anon, authenticated;
revoke execute on function app._my_import(uuid) from public, anon, authenticated;
revoke execute on function app.import_begin(text) from public, anon;
grant execute on function app.import_begin(text) to authenticated;
revoke execute on function app.import_chunk(uuid, jsonb) from public, anon;
grant execute on function app.import_chunk(uuid, jsonb) to authenticated;
revoke execute on function app.import_finish(uuid, jsonb, text) from public, anon;
grant execute on function app.import_finish(uuid, jsonb, text) to authenticated;
revoke execute on function app.import_abort(uuid) from public, anon;
grant execute on function app.import_abort(uuid) to authenticated;
revoke execute on function app.my_open_import() from public, anon;
grant execute on function app.my_open_import() to authenticated;
revoke execute on function app.log_export(text, jsonb, date, date, boolean, boolean, text) from public, anon;
grant execute on function app.log_export(text, jsonb, date, date, boolean, boolean, text) to authenticated;
