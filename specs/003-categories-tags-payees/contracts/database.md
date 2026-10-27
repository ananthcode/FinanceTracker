# Contract: Database functions, triggers and access rules (R3)

Extends [R2's database contract](../../002-accounts-balances/contracts/database.md). Tables:
[data-model.md](../data-model.md). All functions `set search_path = ''`.

## Functions callable by clients (`authenticated`)

| Function | Behaviour |
|----------|-----------|
| `app.apply_changes(p_changes, p_device)` (R2, extended) | Dispatches `category`, `tag`, `payee` changes to new internal appliers. Same guarantees: every row read or written has `user_id = auth.uid()`; ids of other users are `NOT_FOUND`; idempotent by change id; savepoint per change. New checks: sibling-unique names and suffixing; parent same kind and no cycle (`INVALID_MOVE`); limits; person date not after today; person → business only at ₹0.00; delete rules (`HAS_SUBCATEGORIES`, `HAS_ACTIVITY`); merge rules (`INVALID_MERGE`). |
| `app.start_categories(p_choice categories_start, p_defaults jsonb) → jsonb` | `SECURITY DEFINER`, active user only. Takes the user's advisory lock; sets `categories_start` if null (first wins); when the effective request is `suggested` and the user has no non-deleted categories, inserts `p_defaults` (validated: names, kinds, keys, at most two levels) with device type from the caller. Returns `{ choice, added }`. Never touches another user. |
| `app.pull_changes(p_cursor, p_limit)` (R2, extended) | Also returns the caller's `categories`, `tags`, `payees` rows. `SECURITY INVOKER`. |

## Internal functions (not executable by clients)

| Function | Purpose |
|----------|---------|
| `app._apply_category`, `app._apply_tag`, `app._apply_payee` | Per-entity appliers (R2 pattern) |
| `app._merge_category(p_user, p_source, p_target)` | Recursive merge (research R3-05) |
| `app._merge_payee`, `app._merge_tag` | Merges; repoint registry for R4 |
| `app._free_category_name`, `app._free_tag_name`, `app._free_payee_name` | Next free " (n)" name |
| `app.category_has_activity(id)`, `app.payee_has_activity(id)`, `app.tag_usage_count(id)` | `false` / `0` in R3; R4 replaces |
| `app.person_balance_minor(id) → bigint` | Opening balance until R4; mirrors core `personBalance`. Executable by `service_role` for the parity test. |
| `audit.capture_record_change` (R2, extended) | New families `category`, `tag`, `payee`; actions per research R3-14 |
| `app.scrub_user_from_audit` (R1/R2, extended) | Also deletes `category`, `tag`, `payee` audit rows owned by the erased user |

## Triggers

| Table | Trigger | When |
|-------|---------|------|
| `categories`, `tags`, `payees` | `sync.stamp_row()` | before insert or update |
| `categories`, `tags`, `payees` | `audit.capture_record_change()` | after insert or update |

## Access rules that tests MUST prove (Principles I, IX; SC-005)

1. User A cannot select user B's categories, tags or payees (directly or via `pull_changes`).
2. The owner-admin cannot select any other user's categories, tags, payees or their history.
3. `authenticated` has no insert/update/delete on the three tables; direct REST writes fail.
4. `apply_changes` by A with B's ids (as entity, parent, default category, or merge target) changes
   nothing of B's and reports `NOT_FOUND` / `INVALID_MOVE` / `INVALID_MERGE`.
5. `start_categories` by A never reads or writes B's rows or preferences.
6. A disabled user's `apply_changes`, `start_categories` and `pull_changes` raise `USER_INACTIVE` /
   return nothing.
7. Clients cannot read `category` / `tag` / `payee` audit rows.
8. Erasing a user leaves no category, tag, payee or history row of theirs.
