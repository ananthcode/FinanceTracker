-- T023 Change history for synced financial records (FR-027, research R2-08, constitution III).
--
-- Records one audit row per changed row: the changed columns with their values before and after,
-- the device type and change context set by app.apply_changes(), and the owner id so the history
-- can be deleted when the user is erased. TG_ARGV[0] = family ('account' | 'account_group').

create or replace function audit.capture_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family  text := tg_argv[0];
  v_before  jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_after   jsonb := to_jsonb(new);
  v_changes jsonb;
  v_context jsonb := coalesce(nullif(current_setting('app.change_context', true), '')::jsonb, '{}'::jsonb);
  v_device  text := nullif(current_setting('app.device_type', true), '');
  v_action  text;
begin
  select coalesce(jsonb_object_agg(a.key, jsonb_build_object('before', v_before -> a.key, 'after', a.value)), '{}'::jsonb)
    into v_changes
    from jsonb_each(v_after) a
   where a.key not in ('id', 'user_id', 'server_seq', 'field_versions', 'created_at', 'updated_at')
     and (tg_op = 'INSERT' or (v_before -> a.key) is distinct from a.value);

  if v_changes = '{}'::jsonb then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_action := case when (v_context ->> 'renamed')::boolean then v_family || '_sync_renamed' else v_family || '_created' end;
  elsif v_changes ? 'state' then
    v_action := v_family || case new.state::text when 'archived' then '_archived'
                                                  when 'deleted' then '_deleted'
                                                  else '_restored' end;
  elsif (select array_agg(k) from jsonb_object_keys(v_changes) k) <@ array['sort_key'] then
    v_action := v_family || '_reordered';
  elsif v_family = 'account_group' then
    v_action := 'account_group_renamed';
  else
    v_action := 'account_edited';
  end if;

  perform app.write_audit(
    v_action::public.audit_action,
    auth.uid(),
    null,
    v_family,
    new.id,
    null,
    case when v_device in ('web', 'android') then v_device end,
    jsonb_build_object('ownerId', new.user_id, 'changes', v_changes)
      || (v_context - 'renamed' - 'action'));
  return new;
end;
$$;

revoke execute on function audit.capture_record_change() from public, anon, authenticated;
