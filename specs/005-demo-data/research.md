# Research: Demo Data (R5)

## R5-01 Load through the write path, in one transaction

**Decision**: The API route builds the household with core `demoChanges(today, hlc)` — the R2/R3/R4
generators turned into `create` (and `archive`) changes, every demo id replaced by a fresh UUID,
references remapped — and calls `app.load_demo_data(p_changes, p_device)`. That SECURITY DEFINER
function takes the per-user lock, refuses unless the user has no financial rows (`NOT_EMPTY`), applies
each change with `app._apply_one` (the push applier: same validation, stamping, field versions, audit
rows), raises if any change is refused (so nothing is kept), marks the categories start choice, and
writes one `demo_data_loaded` history entry. Capped at 5,000 changes.

**Rationale**: one validation path (constitution VIII), history for every record (III), all-or-nothing
and at-most-once (the lock plus the emptiness check) without new insert code.

**Alternatives**: bulk inserts with a service-role client (needs separate validation and audit);
pushing in chunks of 100 through `/api/sync/push` (cannot be all-or-nothing, can half-load).

## R5-02 Reset is the user's own "erase all my data" (constitution III-a)

**Decision**: `app.reset_my_data(p_device)` (SECURITY DEFINER, `auth.uid()`, per-user lock) deletes
the user's transactions (postings cascade), person rates, payees, tags, categories, accounts and
account groups, the history of those records (`target_type` in the financial set and `ownerId` = the
user, as R4's erasure), and the user's idempotency rows; clears `user_preferences.categories_start`;
records the reset point; writes one `data_reset` history entry (actor, device; no record details).
Profile, role, status, sign-in history and preferences stay.

**Rationale**: clarify Q1 (2026-10-31): records and their history go, one entry stays.

## R5-03 The reset point: other devices start over; old offline changes are refused

**Decision**: `private.data_resets (user_id pk, reset_at timestamptz, reset_seq bigint)` — `reset_seq`
is the last `server_seq` issued when the reset ran. `app.pull_changes` returns `{ reset: true }` with
an empty page and `cursor: 0` when `0 < p_cursor < reset_seq`, so a client wipes its local copy and
pulls from 0. `app.apply_changes` (push) refuses a change whose HLC time is before `reset_at` with the
new code `DATA_RESET`. The demo load calls `_apply_one` directly, so its own changes are not refused.

**Rationale**: FR-012. Device clocks can run ahead; HLC times already clamp to the server clock
(R2-02), so a change made after the reset never looks older than it.

**Alternatives**: a per-user "epoch" in every row (larger change to every table); relying on clients
to refetch on a signal (an offline device would still push stale changes).

## R5-04 Where loading is allowed

**Decision**: the route offers `load` and `reset_and_load` only when `NEXT_PUBLIC_APP_ENV` is `demo`
(local development uses `demo` too, per `.env.example`); `reset` is always offered. The Settings section hides what is
not offered; the route refuses it (`NOT_AVAILABLE`).

**Rationale**: constitution X ("real data only in the live environment"); the edge case in the spec.

## R5-05 Determinism and "today"

**Decision**: `today` is the user's calendar date in their timezone (`todayInZone`); the same day gives
the same records. Demo ids are fixed in core and replaced per user by a deterministic-per-call map
(fresh UUIDs), which does not change amounts, dates or balances.

## R5-06 Web UI

**Decision**: Settings gains "Your data": "Load demo data" (only when the user has no records),
"Reset my data" and "Reset and load demo data" (both behind a dialog that names what is removed and
enables the action only when "RESET" is typed). After an action the page refreshes and states the
outcome in words ("Added 8 accounts, 78 categories, 13 payees and people, 5 tags and 280
transactions").
