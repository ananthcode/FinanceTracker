-- T029 The one-time start choice for the default categories (FR-007, research R3-06).
--
-- REVIEW (constitution workflow — RLS): SECURITY DEFINER, scoped to auth.uid(). It takes the same
-- per-user advisory lock as sync.stamp_row, so two devices answering at once cannot both insert the
-- defaults; the first answer is kept. The default list comes from packages/core (passed by the API
-- route) and is validated here and by the table's checks.

alter table public.user_preferences add column categories_start public.categories_start;
-- Not in R1's grant list: only app.start_categories sets it.

create or replace function app.start_categories(p_choice public.categories_start, p_defaults jsonb,
                                                p_device text default 'web')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_stored   public.categories_start;
  v_added    int := 0;
  v_hlc      text;
  v_versions jsonb;
  v_parent   jsonb;
  v_child    jsonb;
  v_kind     public.category_kind;
  v_id       uuid;
begin
  if v_user is null or not app.is_active_user() then
    raise exception 'USER_INACTIVE';
  end if;
  if p_choice is null or p_device is null or p_device not in ('web', 'android') then
    raise exception 'VALIDATION_FAILED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sync:' || v_user::text, 0));

  update public.user_preferences p set categories_start = p_choice
   where p.user_id = v_user and p.categories_start is null;
  select p.categories_start into v_stored from public.user_preferences p where p.user_id = v_user;
  if v_stored is null then
    raise exception 'VALIDATION_FAILED';
  end if;

  -- "Start with suggested" and "Add suggested categories" both add the defaults, but only while the
  -- user has no categories, so they are never added twice (SC-008).
  if p_choice = 'suggested'
     and not exists (select 1 from public.categories c where c.user_id = v_user and c.state <> 'deleted') then
    if jsonb_typeof(p_defaults) is distinct from 'array' then
      raise exception 'VALIDATION_FAILED';
    end if;
    v_hlc := lpad(floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text, 13, '0') || '.0000.server00';
    v_versions := jsonb_build_object('name', v_hlc, 'parentId', v_hlc, 'colour', v_hlc, 'icon', v_hlc,
                                     'hidden', v_hlc, 'state', v_hlc);
    perform set_config('app.device_type', p_device, true);
    perform set_config('app.change_context', jsonb_build_object('hlc', v_hlc, 'clamped', false)::text, true);

    for v_parent in select e.value from jsonb_array_elements(p_defaults) e loop
      if jsonb_typeof(v_parent) <> 'object' or jsonb_typeof(v_parent -> 'children') is distinct from 'array' then
        raise exception 'VALIDATION_FAILED';
      end if;
      v_kind := (v_parent ->> 'kind')::public.category_kind;
      v_id := gen_random_uuid();
      insert into public.categories (id, user_id, name, kind, colour, icon, field_versions)
      values (v_id, v_user, v_parent ->> 'name', v_kind, v_parent ->> 'colour', v_parent ->> 'icon', v_versions);
      v_added := v_added + 1;
      for v_child in select e.value from jsonb_array_elements(v_parent -> 'children') e loop
        -- Defaults are at most two levels deep.
        if jsonb_typeof(v_child) <> 'object' or v_child ? 'children' then
          raise exception 'VALIDATION_FAILED';
        end if;
        insert into public.categories (id, user_id, name, kind, parent_id, colour, icon, field_versions)
        values (gen_random_uuid(), v_user, v_child ->> 'name', v_kind, v_id,
                coalesce(v_child ->> 'colour', v_parent ->> 'colour'), coalesce(v_child ->> 'icon', v_parent ->> 'icon'),
                v_versions);
        v_added := v_added + 1;
      end loop;
    end loop;
    if (select count(*) from public.categories c where c.user_id = v_user and c.state <> 'deleted') > 500 then
      raise exception 'LIMIT_REACHED';
    end if;

    perform set_config('app.change_context', '', true);
    perform set_config('app.device_type', '', true);
  end if;

  return jsonb_build_object('choice', v_stored, 'added', v_added);
end;
$$;

revoke execute on function app.start_categories(public.categories_start, jsonb, text) from public, anon;
grant execute on function app.start_categories(public.categories_start, jsonb, text) to authenticated;
