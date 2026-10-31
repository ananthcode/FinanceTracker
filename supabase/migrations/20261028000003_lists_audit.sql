-- T011 Change history for categories, tags and payees (FR-028, research R3-14).
-- Same function as 20261024000003_audit_record_change.sql; the action derivation learns the R3
-- families: a row deleted by a merge is "merged"; moving (parent only) and hiding are named.

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
  v_keys    text[];
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
  select array_agg(k) into v_keys from jsonb_object_keys(v_changes) k;

  if tg_op = 'INSERT' then
    v_action := case when (v_context ->> 'renamed')::boolean then v_family || '_sync_renamed' else v_family || '_created' end;
  elsif v_changes ? 'state' then
    v_action := v_family || case
                  when v_after ->> 'state' = 'archived' then '_archived'
                  when v_after ->> 'state' = 'deleted' and v_after ->> 'merged_into' is not null then '_merged'
                  when v_after ->> 'state' = 'deleted' then '_deleted'
                  else '_restored' end;
  elsif v_family in ('account', 'account_group') and v_keys <@ array['sort_key'] then
    v_action := v_family || '_reordered';
  elsif v_family in ('category', 'payee') and v_keys <@ array['hidden'] then
    v_action := v_family || case when (v_after ->> 'hidden')::boolean then '_hidden' else '_unhidden' end;
  elsif v_family = 'category' and v_keys <@ array['parent_id'] then
    v_action := 'category_moved';
  else
    v_action := case v_family when 'account_group' then 'account_group_renamed'
                               when 'tag' then 'tag_renamed'
                               else v_family || '_edited' end;
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
