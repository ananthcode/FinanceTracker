# Data Model: Accounts & Balances (R2)

Builds on R1's model ([001 data-model](../001-identity-access-shell/data-model.md)): `profiles`,
`user_preferences`, `audit_events`, `app.is_active_user()`. Money is `bigint` paise (Principle II).
Every synced table follows the **synced-table conventions** below so R3/R4 can reuse them.

## Synced-table conventions (every table that syncs to Android)

| Column | Type | Rule |
|--------|------|------|
| `id` | `uuid` PK | Generated on the client (Principle IV); never reused |
| `user_id` | `uuid` not null → `auth.users(id)` on delete cascade | Owner; set by the server from `auth.uid()`, never from the payload |
| `field_versions` | `jsonb` not null default `{}` | Field name → HLC of the change that last set it (research R2-02) |
| `server_seq` | `bigint` not null | From global sequence `sync.seq`, set by trigger on insert/update after taking the owner's advisory lock (R2-04) |
| `created_at`, `updated_at` | `timestamptz` not null | Server time |

- Grants: `select` to `authenticated` only. **No insert/update/delete grants** — the only write
  path is `app.apply_changes()` (contracts/database.md).
- RLS: `select` where `user_id = auth.uid()` and `app.is_active_user()`.
- Triggers: `sync.stamp_row()` (lock + `server_seq` + `updated_at`), `audit.capture_record_change()`
  (R2-08).

## Enums

| Enum | Values |
|------|--------|
| `public.account_type` | `bank`, `cash`, `wallet`, `credit_card` |
| `public.record_state` | `active`, `archived`, `deleted` (groups use `active`, `deleted`) |
| `public.accounts_view` | `by_type`, `my_groups` |
| `public.audit_action` (added values) | `account_created`, `account_edited`, `account_reordered`, `account_archived`, `account_restored`, `account_deleted`, `account_sync_renamed`, `account_group_created`, `account_group_renamed`, `account_group_reordered`, `account_group_deleted` |
| `audit_events.target_type` check (added) | `account`, `account_group` |

## Entity: Account — `public.accounts` (synced)

| Field | Type | Rules (requirement) |
|-------|------|---------------------|
| `name` | `text` not null | Trimmed; 1–40 chars (FR-002); unique per user ignoring case among `state <> 'deleted'` — partial unique index on `(user_id, lower(name))` |
| `type` | `account_type` not null | FR-001; change between owned (`bank`/`cash`/`wallet`) and owed (`credit_card`) allowed after client confirmation (FR-011) |
| `opening_balance_minor` | `bigint` not null | Paise; `between -999999999999 and 999999999999` (FR-003). Meaning by type: held (bank/cash/wallet) or owed (credit card) (FR-005) |
| `opening_balance_date` | `date` not null | Calendar date (Principle XII); not after "today" in the user's timezone — checked in `apply_changes()` (FR-004) |
| `currency` | `char(3)` not null | Must equal the user's `base_currency` (FR-007); set by the server |
| `colour` | `text` not null | One of the 12 palette keys (FR-008) |
| `icon` | `text` not null | One of the icon keys (FR-008) |
| `sort_key` | `text collate "C"` not null, 1–1000 chars | Fractional index; one order per user across both views (FR-010, R2-06); the C collation orders keys like JavaScript |
| `group_id` | `uuid` null → `account_groups(id)` | User group (FR-009a); must belong to the same user; a deleted group is treated as none |
| `include_in_net_worth` | `boolean` not null default `true` | FR-018 |
| `notes` | `text` null | ≤ 500 chars (FR-006) |
| `credit_limit_minor` | `bigint` null | Only when `type = 'credit_card'`; `> 0` (FR-006) |
| `state` | `record_state` not null default `active` | See state transitions |
| `archived_at`, `deleted_at` | `timestamptz` null | Set with state |

**Check constraints**: `char_length(btrim(name)) between 1 and 40`; `credit_limit_minor is null or
(type = 'credit_card' and credit_limit_minor > 0)`; `char_length(notes) <= 500`; colour/icon in
allowed sets (SQL arrays mirrored from `packages/core` and tested for equality).

**Limit**: ≤ 200 accounts per user with `state <> 'deleted'` (FR-025), enforced in `apply_changes()`.

**Derived (not stored)**: current balance = `opening_balance_minor` + movements on/after
`opening_balance_date` (R4); in R2 = opening balance. `app.account_balance_minor(id)` and
`packages/core` compute it identically (R2-07).

### State transitions

```text
            create
              │
              ▼
   ┌────── active ◄──────── restore ─────┐
   │          │                          │
   │          │ archive (balance = 0.00) │
   │          ▼                          │
   │      archived ──────────────────────┘
   │          │
   │ delete   │ delete
   │ (no      │ (no activity)
   │ activity)▼
   └────► deleted   (terminal; kept for history; name no longer reserved)
```

- **archive**: only when `app.account_balance_minor(id) = 0` (FR-022); otherwise rejected
  `BALANCE_NOT_ZERO`. If a later change (R4) makes an archived account's balance non-zero, it is
  shown in totals and flagged "archived with a balance" — a derived flag, no extra state.
- **delete**: only when `app.account_has_activity(id)` is false (FR-024); otherwise converted to
  archive if the balance is 0.00, else rejected `HAS_ACTIVITY` (FR-034, R2-13).
- **restore**: `archived → active`; position is unchanged because `sort_key` and `group_id` were
  kept (FR-023).
- Edits to an archived account are allowed (fields change, state does not); edits to a deleted
  account are ignored and reported `NOT_FOUND`.

## Entity: User group — `public.account_groups` (synced)

| Field | Type | Rules |
|-------|------|-------|
| `name` | `text` not null | Trimmed; 1–30 chars; unique per user ignoring case among active groups (FR-009a) |
| `sort_key` | `text collate "C"` not null, 1–1000 chars | Fractional index for group order |
| `state` | `record_state` not null default `active`, check `state in (active, deleted)` | `active` → `deleted` only; ≤ 30 active groups per user |

Deleting a group (FR-009b) sets its `state = 'deleted'` and, in the same transaction, clears
`group_id` on every account of that user in the group (each account change audited as
`account_edited` with device type). An account change that points at a deleted group stores
`group_id = null`.

## Entity: Applied change — `private.applied_changes` (server only)

| Field | Type | Rules |
|-------|------|-------|
| `user_id` | `uuid` → `auth.users` on delete cascade | |
| `change_id` | `uuid` | Client-generated; PK `(user_id, change_id)` (R2-03) |
| `applied_at` | `timestamptz` | |
| `result` | `jsonb` | The per-change result returned to the client (no payload values) |

Not readable by clients (private schema).

## Entity: User preferences — `public.user_preferences` (R1, extended)

| Field | Type | Rules |
|-------|------|-------|
| `accounts_view` | `accounts_view` not null default `by_type` | FR-009; updatable column for `authenticated` alongside R1's preference columns; captured by R1's preference audit trigger |

## Entity: Account change record — `public.audit_events` (R1, extended)

Written only by `audit.capture_record_change()`:

| Field | Value for account/group changes |
|-------|----------------------------------|
| `actor_id` | `auth.uid()` |
| `action` | one of the added `account_*` / `account_group_*` values |
| `target_type` / `target_id` | `account` or `account_group` / the row id |
| `device_type` | `web` or `android`, from `apply_changes()` |
| `details` | `{ ownerId, changes: { field: { before, after } }, changeId, hlc, clamped? }` |

No client read policy for these rows in R2. Deleted (not scrubbed) when the user is erased
(R2-08).

## On device (Android phase — R2-15)

| Store | Content |
|-------|---------|
| SQLite `accounts`, `account_groups` | Mirror of the user's rows incl. `field_versions`, `server_seq` |
| SQLite `pending_changes` | Outbox: change id, entity, entity id, kind, fields JSON, HLC, created at, attempts, last result |
| SQLite `sync_state` | `cursor` (last `server_seq`), `hlc` (last issued/seen), `user_id` |

## Requirement → model traceability

| Requirement | Where enforced |
|-------------|----------------|
| FR-001–FR-007 | `accounts` columns + checks; `apply_changes()` validation (date, currency, limit) |
| FR-008, FR-010 | `colour`, `icon`, `sort_key`; core appearance keys |
| FR-009, FR-009a/b | `account_groups`, `accounts.group_id`, `user_preferences.accounts_view` |
| FR-012–FR-019 | Derived in `packages/core` + `app.account_balance_minor()` |
| FR-021–FR-025 | `state` transitions in `apply_changes()`; partial unique index; 200 limit |
| FR-026 | RLS select-own; no write grants; `apply_changes()` sets `user_id` from `auth.uid()` |
| FR-027, FR-029 | `audit.capture_record_change()`; erasure deletes account history |
| FR-030–FR-032 | `field_versions` + HLC merge; `applied_changes`; rename suffix |
| FR-033, FR-034 | Device outbox; delete→archive conversion in `apply_changes()` |
