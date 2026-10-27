# Contract: Database functions, triggers and access rules (R2)

Extends [R1's database contract](../../001-identity-access-shell/contracts/database.md). Tables
and columns: [data-model.md](../data-model.md). All functions `set search_path = ''`.

## Functions callable by clients (RPC, `authenticated`)

| Function | Behaviour |
|----------|-----------|
| `app.apply_changes(p_changes jsonb, p_device text) → jsonb` | `SECURITY DEFINER`. Requires `app.is_active_user()` (else raises `USER_INACTIVE`). Sets `app.device_type` for the transaction. For each change, in order: record `(auth.uid(), changeId)` in `private.applied_changes` (on conflict return the stored result as `duplicate`); validate (types, lengths, palette/icon keys, date not after today in the user's timezone, currency = base currency, group belongs to caller, 200-account / 30-group limits); apply the per-field merge ([sync-protocol](sync-protocol.md#merge-rule-per-field-latest-edit-wins--fr-030)); apply state rules (archive needs `account_balance_minor = 0`; delete needs no activity, else convert/reject); resolve name conflicts per `onNameConflict`; store and return the result. **Every row it touches has `user_id = auth.uid()`; it never reads or writes another user's rows.** |
| `app.merge_field_versions(p_versions jsonb, p_fields text[], p_hlc text, p_received_at timestamptz) → jsonb` | Pure (IMMUTABLE) per-field merge used by `apply_changes`; the SQL twin of `mergeFields`. Executable by `authenticated` and `service_role` for the parity test; it reads no table. |
| `app.pull_changes(p_cursor bigint, p_limit int default 500) → jsonb` | `SECURITY INVOKER` (RLS applies). `p_limit` is clamped to 1–500. Returns the caller's `accounts` and `account_groups` with `server_seq > p_cursor`, ordered, plus the next cursor and `hasMore`. |

`apply_changes` is called by the API route only; it is still safe if called directly, because
it scopes everything to `auth.uid()` and validates itself.

## Internal functions (not executable by clients)

| Function | Purpose |
|----------|---------|
| `app.account_balance_minor(p_account uuid) → bigint` | Opening balance + movements (R4 extends); mirrors `packages/core` (R2-07). Executable by `service_role` only (parity test). |
| `app.account_has_activity(p_account uuid) → boolean` | `false` in R2; R4 replaces (R2-13) |
| `sync.stamp_row()` trigger | `pg_advisory_xact_lock(owner)`, `server_seq = nextval('sync.seq')`, `updated_at = now()` |
| `audit.capture_record_change(action_family, target_type)` trigger | Before/after per changed field, device type, owner id (R2-08). Reads two transaction-local settings written by `apply_changes`: `app.device_type` (`web` / `android`) and `app.change_context` (JSON: `changeId`, `hlc`, `clamped`, `renamed`). |
| `app._apply_account`, `app._apply_group`, `app._apply_one`, `app._free_*_name`, `app._set_change_context`, `app._change_result` | Internal helpers of `apply_changes`; not executable by clients. |
| `app.scrub_user_from_audit(...)` (R1, extended) | Also deletes `account` / `account_group` audit rows owned by the erased user |

## Triggers

| Table | Trigger | When |
|-------|---------|------|
| `accounts`, `account_groups` | `sync.stamp_row()` | before insert or update |
| `accounts`, `account_groups` | `audit.capture_record_change()` | after insert or update |

## Access rules that tests MUST prove (Principle I, IX; SC-004)

1. User A cannot select user B's accounts, groups or applied changes (also via `pull_changes`).
2. The owner-admin cannot select any other user's accounts, groups or account history.
3. `authenticated` has no insert/update/delete on `accounts` / `account_groups`; direct writes
   through the REST API fail.
4. `apply_changes` called by user A with B's account id cannot change B's row (reported
   `NOT_FOUND`), and a create with a crafted `userId` field fails validation.
5. A disabled user's `apply_changes` and `pull_changes` return nothing / raise `USER_INACTIVE`.
6. Clients cannot read `account`/`account_group` audit rows.
7. Replaying the same `changeId` never applies twice.
8. Erasing a user leaves no account, group, applied change or account history row of theirs.
