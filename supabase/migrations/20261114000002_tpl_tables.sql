-- T002 Quick-add templates (specs/008-quick-add-templates/data-model.md; research R8-01, R8-02).
-- A synced table shaped like a transaction, without its date. Clients may only SELECT their own rows;
-- every write goes through app.apply_changes.
--
-- REVIEW (constitution workflow — RLS): select-own for active users; composite foreign keys keep every
-- reference within the owner, whatever the code does.

create table public.transaction_templates (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  kind           public.transaction_kind not null check (kind <> 'interest'),
  flow           public.money_flow not null,
  account_id     uuid not null,
  to_account_id  uuid,
  -- null = "amount each time" (clarify Q4).
  amount_minor   bigint check (amount_minor is null or amount_minor between 1 and 999999999999),
  payee_id       uuid,
  person_action  public.person_action check (person_action is null or person_action <> 'adjustment'),
  category_id    uuid,
  -- R4 split lines: [{ id, amountMinor, categoryId, personId, personAction, notes, tagIds }]
  lines          jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  tag_ids        uuid[] not null default '{}',
  notes          text check (notes is null or char_length(notes) <= 1000),
  -- The planned payment a recording pays (clarify Q1, research R8-04).
  plan_item_id   uuid,
  sort_key       text not null,
  hidden         boolean not null default false,
  state          public.record_state not null default 'active' check (state in ('active', 'deleted')),
  deleted_at     timestamptz,
  field_versions jsonb not null default '{}'::jsonb,
  server_seq     bigint not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id),
  foreign key (payee_id, user_id) references public.payees (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (plan_item_id, user_id) references public.plan_items (id, user_id),
  -- Coarse shape per kind (the full rules are in app._apply_template), as R4's transactions_shape.
  constraint transaction_templates_shape check (
    case kind
      when 'transfer' then to_account_id is not null and to_account_id <> account_id
                           and payee_id is null and person_action is null and category_id is null and flow = 'out'
      when 'person' then payee_id is not null and person_action is not null and to_account_id is null
                         and category_id is null
      else to_account_id is null and person_action is null
           and flow = case kind when 'expense' then 'out'::public.money_flow else 'in'::public.money_flow end
    end),
  -- A split has an amount for its lines to add up to (FR-002).
  constraint transaction_templates_split_amount check (jsonb_array_length(lines) = 0 or amount_minor is not null)
);

create unique index transaction_templates_name_unique on public.transaction_templates (user_id, lower(name)) where state <> 'deleted';
create index transaction_templates_sync_idx on public.transaction_templates (user_id, server_seq);
create index transaction_templates_payee_idx on public.transaction_templates (payee_id) where payee_id is not null;
create index transaction_templates_category_idx on public.transaction_templates (category_id) where category_id is not null;
create index transaction_templates_tags_idx on public.transaction_templates using gin (tag_ids);

alter table public.transaction_templates enable row level security;
revoke all on public.transaction_templates from public, anon, authenticated;
grant select on public.transaction_templates to authenticated;

create policy transaction_templates_select_own on public.transaction_templates
  for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

create trigger transaction_templates_stamp before insert or update on public.transaction_templates
  for each row execute function sync.stamp_row();
create trigger transaction_templates_capture_change after insert or update on public.transaction_templates
  for each row execute function audit.capture_record_change('template');

-- The history names hiding and reordering for templates too (as for payees and accounts).
-- As 20261101000005_tx_apply.sql, with the `template` family in those two branches.
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
  elsif v_family in ('account', 'account_group', 'template') and v_keys <@ array['sort_key'] then
    v_action := v_family || '_reordered';
  elsif v_family in ('category', 'payee', 'template') and v_keys <@ array['hidden'] then
    v_action := v_family || case when (v_after ->> 'hidden')::boolean then '_hidden' else '_unhidden' end;
  elsif v_family = 'category' and v_keys <@ array['parent_id'] then
    v_action := 'category_moved';
  elsif v_family = 'transaction' and v_keys <@ array['confirmed'] and (v_after ->> 'confirmed')::boolean then
    v_action := 'transaction_confirmed';
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
