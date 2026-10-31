# Data Model: Demo Data (R5)

Builds on R2–R4. No new synced tables.

## `private.data_resets` (server only, no client grants)

| Column | Type | Rules |
|--------|------|-------|
| `user_id` | uuid, PK, FK → `auth.users` on delete cascade | one row per user, replaced on each reset |
| `reset_at` | timestamptz | server time of the latest reset |
| `reset_seq` | bigint | the last `server_seq` issued when the reset ran |

Used by `app.pull_changes` (cursor older than `reset_seq` → `reset: true`) and `app.apply_changes`
(a change whose HLC time is before `reset_at` → `DATA_RESET`).

## Audit actions (new)

| Action | Target | Details |
|--------|--------|---------|
| `demo_data_loaded` | the user | `ownerId`, counts per kind |
| `data_reset` | the user | `ownerId` only — nothing about removed records |

## What a reset removes (the user's own rows)

`transactions` (and `private.transaction_postings` by cascade), `person_rates`, `payees`, `tags`,
`categories`, `accounts`, `account_groups`; `audit_events` whose `target_type` is one of
`account, account_group, category, tag, payee, transaction, person_rate` and `details.ownerId` is the
user; `private.applied_changes` of the user. `user_preferences.categories_start` becomes null.

Kept: `auth.users`, `profiles`, the rest of `user_preferences`, sign-in history, other history.

## Demo household (generated, never stored as such)

From core `demoAccounts()`, `demoLists()`, `demoTransactions(today)`; `demoChanges(today, hlc)`
returns, in dependency order: account groups → accounts (then `archive` for archived ones) →
categories (parents first) → tags → payees → person rates → transactions. Ids are replaced by fresh
UUIDs and references remapped. Counts at 31-Oct-2026: 2 groups, 8 accounts, 78 categories, 5 tags,
13 payees and people, 2 rates, about 280 transactions.
