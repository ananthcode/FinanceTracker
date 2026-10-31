-- T016 Reset / clear my data (R5 US2; FR-007 – FR-012; research R5-02).
--
-- REVIEW (constitution workflow — RLS, erasure): SECURITY DEFINER, for auth.uid() only. This is the
-- user's own explicit "erase all my data" (constitution III-a): their financial rows and the history
-- of those rows are deleted permanently (clarify Q1, 2026-10-31); one `data_reset` entry stays. Every
-- statement filters on the caller's user_id. Profile, role, status, sign-in history and preferences
-- (except the categories start choice) are kept.

create or replace function app._reset_user_data(p_user uuid, p_device text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed jsonb;
  v_n       integer;
begin
  if p_device is null or p_device not in ('web', 'android') then
    raise exception 'VALIDATION_FAILED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sync:' || p_user::text, 0));

  -- Children first: transactions (postings cascade) and rates use accounts, payees, categories, tags.
  delete from public.transactions t where t.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := jsonb_build_object('transactions', v_n);
  delete from public.person_rates r where r.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('rates', v_n);
  delete from public.payees y where y.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('payees', v_n);
  delete from public.tags t where t.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('tags', v_n);
  delete from public.categories c where c.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('categories', v_n);
  delete from public.accounts a where a.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('accounts', v_n);
  delete from public.account_groups g where g.user_id = p_user;
  get diagnostics v_n = row_count;
  v_removed := v_removed || jsonb_build_object('groups', v_n);

  -- Their history, as the R4 erasure does; and the replay memory of their changes.
  delete from public.audit_events e
   where e.target_type in ('account', 'account_group', 'category', 'tag', 'payee', 'transaction', 'person_rate')
     and e.details ->> 'ownerId' = p_user::text;
  delete from private.applied_changes c where c.user_id = p_user;

  update public.user_preferences p set categories_start = null where p.user_id = p_user;
  -- The reset point (research R5-03): older cursors start over; older changes are refused.
  insert into private.data_resets (user_id, reset_at, reset_seq)
  values (p_user, now(), nextval('sync.seq'))
  on conflict (user_id) do update set reset_at = excluded.reset_at, reset_seq = excluded.reset_seq;

  perform app.write_audit('data_reset'::public.audit_action, auth.uid(), null, 'user', p_user, null, p_device,
                          jsonb_build_object('ownerId', p_user));
  return v_removed;
end;
$$;

create or replace function app.reset_my_data(p_device text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  return jsonb_build_object('removed', app._reset_user_data(auth.uid(), p_device));
end;
$$;

revoke execute on function app._reset_user_data(uuid, text) from public, anon, authenticated;
revoke execute on function app.reset_my_data(text) from public, anon;
grant execute on function app.reset_my_data(text) to authenticated;
