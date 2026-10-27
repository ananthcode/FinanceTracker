# Data Model: Categories, Tags & Payees (R3)

Builds on R1 and R2 ([002 data-model](../002-accounts-balances/data-model.md)). All three tables follow
R2's **synced-table conventions** (`id` client UUID, `user_id` from `auth.uid()`, `field_versions`,
`server_seq`, `created_at`, `updated_at`; SELECT-only grants; RLS select-own and active user;
`sync.stamp_row` and `audit.capture_record_change` triggers). Money is `bigint` paise.

## Enums

| Enum | Values |
|------|--------|
| `public.category_kind` | `expense`, `income` |
| `public.payee_kind` | `business`, `person` |
| `public.categories_start` | `suggested`, `empty` |
| `public.audit_action` (added) | `category_created`, `category_edited`, `category_moved`, `category_hidden`, `category_unhidden`, `category_merged`, `category_deleted`, `category_sync_renamed`, `tag_created`, `tag_renamed`, `tag_merged`, `tag_deleted`, `tag_sync_renamed`, `payee_created`, `payee_edited`, `payee_hidden`, `payee_unhidden`, `payee_merged`, `payee_deleted`, `payee_sync_renamed` |
| `audit_events.target_type` check (added) | `category`, `tag`, `payee` |

`state` reuses R2's `record_state`, restricted to `active` / `deleted` by a check (no archive).

## Entity: Category — `public.categories` (synced)

| Field | Type | Rules (requirement) |
|-------|------|---------------------|
| `name` | `text` not null | Trimmed, 1–40 chars (FR-002) |
| `kind` | `category_kind` not null | Set on create, never updated (FR-001) |
| `parent_id` | `uuid` null | Composite FK `(parent_id, user_id, kind) → categories (id, user_id, kind)`: same user, same kind (FR-001, FR-006); no cycles (checked in `apply_changes`) |
| `colour` | `text` not null | One of the 12 palette keys (FR-003) |
| `icon` | `text` not null | One of the 48 icon keys (R3-09) |
| `hidden` | `boolean` not null default `false` | FR-022; pickers also hide descendants of hidden categories (derived) |
| `state` | `record_state` not null default `active`, check in (`active`, `deleted`) | |
| `merged_into` | `uuid` null → `categories(id)` | Set when deleted by a merge (FR-023) |
| `deleted_at` | `timestamptz` null | |

Also: `unique (id, user_id, kind)` (target of the composite FK); partial unique index
`(user_id, kind, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'), lower(name)) where
state <> 'deleted'` (FR-002). Limit 500 non-deleted per user (FR-008).

**Derived (core)**: full path ("Education › Kids › Swimming classes"), alphabetical order per level
(`localeCompare`, case-insensitive), effective hidden, search matches.

## Entity: Tag — `public.tags` (synced)

| Field | Type | Rules |
|-------|------|-------|
| `name` | `text` not null | Trimmed, 1–30 chars; unique per user ignoring case among non-deleted (FR-009) |
| `state` | `record_state`, check in (`active`, `deleted`) | |
| `merged_into` | `uuid` null → `tags(id)` | FR-010 |
| `deleted_at` | `timestamptz` null | |

Limit 500 non-deleted per user (FR-011).

## Entity: Payee — `public.payees` (synced)

| Field | Type | Rules |
|-------|------|-------|
| `name` | `text` not null | Trimmed, 1–60 chars; unique per user ignoring case among non-deleted, hidden included (FR-012) |
| `kind` | `payee_kind` not null | Editable; person → business only at balance ₹0.00 (FR-014) |
| `default_category_id` | `uuid` null | Composite FK `(default_category_id, user_id) → categories (id, user_id)`; cleared when that category is deleted; repointed when it is merged |
| `notes` | `text` null | ≤ 500 chars |
| `hidden` | `boolean` not null default `false` | FR-022 |
| `opening_balance_minor` | `bigint` not null default 0 | Between −999999999999 and 999999999999. **Positive = they owe the user**, negative = the user owes them (FR-016) |
| `opening_balance_date` | `date` null | Required for people; not after today in the user's timezone (checked in `apply_changes`) |
| `include_in_net_worth` | `boolean` not null default `false` | FR-020 |
| `state` | `record_state`, check in (`active`, `deleted`) | |
| `merged_into` | `uuid` null → `payees(id)` | FR-024 |
| `deleted_at` | `timestamptz` null | |

Check: `kind = 'person' or (opening_balance_minor = 0 and opening_balance_date is null and not
include_in_net_worth)`; `kind = 'business' or opening_balance_date is not null`. Limit 2,000
non-deleted per user (FR-015).

**Derived**: person balance = opening balance + R4 movements on/after the date (FR-017);
`app.person_balance_minor(id)` and core `personBalance` agree (vectors). People totals (FR-019):
`owedToYou` = sum of positive balances, `youOwe` = −(sum of negative balances), over non-deleted
people (hidden included).

### Payee kind transitions

```text
business ──(any time)──► person   (starts at ₹0.00, settled; date set to today)
person ──(balance = ₹0.00 only)──► business   (opening fields cleared)
```

## Entity: User preferences — `public.user_preferences` (extended)

| Field | Type | Rules |
|-------|------|-------|
| `categories_start` | `categories_start` null | Set once by `app.start_categories` (first answer wins, FR-007); not writable directly by clients |

## Reference map (what merge and delete repoint — R3-05)

| Referenced | Referenced by (R3) | Added later |
|-----------|--------------------|-------------|
| `categories` | `categories.parent_id`, `payees.default_category_id` | R4 transactions and split lines; budgets (2b) |
| `payees` | — | R4 transactions; person-ledger movements; R7 plan items |
| `tags` | — | R4 transaction tags |

## State transitions (all three entities)

```text
create ──► active ──(update incl. hide/unhide, move)──► active
             │
             ├──(delete: no activity; categories also no children)──► deleted
             └──(merge into target)──► deleted (merged_into = target)
```

Deleted is terminal and frees the name. Edits to a deleted record are `NOT_FOUND`.

## Requirement → model traceability

| Requirement | Where enforced |
|-------------|----------------|
| FR-001–FR-006 | `categories` columns, composite FK, unique index; cycle check in `apply_changes`; core tree helpers |
| FR-007 | `user_preferences.categories_start`; `app.start_categories`; core `DEFAULT_CATEGORIES` |
| FR-008, FR-011, FR-015 | Limits in `apply_changes` |
| FR-009–FR-010 | `tags`; merge/delete in `apply_changes` |
| FR-012–FR-014 | `payees`; kind check + `person_balance_minor` |
| FR-016–FR-020 | Payee opening fields; core `people/`; `summarise` people input |
| FR-022–FR-025 | `hidden`; merge kind; delete rules + has-activity placeholders |
| FR-027–FR-030 | RLS; audit trigger and new actions; erasure extension |
| FR-031–FR-033 | R2 sync engine; suffix rule; server-side merge/delete checks |
| FR-034 | Web navigation (client contract) |
