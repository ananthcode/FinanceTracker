# Review notes: Demo Data (R5)

Code the constitution requires the owner to review explicitly before merge (Development Workflow
& Quality Gates: authorization/RLS, sync, erasure). Links are relative to the repository root.

## 1. `app.reset_my_data` — the user's own "erase all my data" (SECURITY DEFINER)

[20261102000003_data_reset.sql](../../supabase/migrations/20261102000003_data_reset.sql)

- Runs for `auth.uid()` only (the worker `app._reset_user_data` is revoked from clients); every
  `delete` filters on `user_id = p_user`; takes the per-user sync lock.
- **Hard delete** of the user's transactions (postings cascade), person rates, payees, tags,
  categories, accounts and account groups — constitution III-a. Their history goes too (clarify Q1,
  2026-10-31), selected exactly as R4's erasure does (`target_type` in the financial set and
  `details.ownerId` = the user). One `data_reset` entry stays, with only `ownerId`.
- Kept: `auth.users`, profile (role, status), preferences except `categories_start`, sign-in history.
- Tests: [data_reset.test.sql](../../supabase/tests/data_reset.test.sql) (17) — the caller's rows and
  history are gone, another user's rows and history are unchanged, profile and preferences kept,
  clients cannot call the worker; integration resets 20,000 transactions in under 10 s.

## 2. `app.load_demo_data` / `app.reset_and_load_demo` (SECURITY DEFINER)

[20261102000004_data_load.sql](../../supabase/migrations/20261102000004_data_load.sql)

- Each change goes through `app._apply_one`, the push applier: the same validation, ownership checks,
  stamping, field versions and history as a user's own push. So a load can do nothing a push could
  not; the function adds only "empty data only" (`NOT_EMPTY`), all-or-nothing (`DEMO_REJECTED`
  undoes the whole load) and the per-user lock (at most once). Capped at 5,000 changes.
- The changes are built on the server (`demoChanges` in core) from the synthetic generators — the
  request carries only the action. A client calling the function directly gains nothing beyond push.
- "Demo environment only" is the route's rule (`NEXT_PUBLIC_APP_ENV = demo`), as research R5-04.
- Tests: [data_load.test.sql](../../supabase/tests/data_load.test.sql) (13); integration (same-day
  determinism, concurrent loads → one household).

## 3. The reset point — sync

[20261102000002_data_resets.sql](../../supabase/migrations/20261102000002_data_resets.sql)

- `private.data_resets` has no client grants; `app._my_reset_seq()` returns only the caller's value.
- `app.pull_changes` (replaced, still INVOKER) answers `reset: true` for a cursor older than the last
  reset; `app.apply_changes` (replaced) refuses a change whose HLC time is before the reset
  (`DATA_RESET`). Both are copies of the R4 functions plus these checks.
- Android must handle `reset: true` (wipe and pull from 0) and drop `DATA_RESET` results — carried to
  the Android phase (T022).

## Decisions and interpretations

- Clarify Q1: reset removes the records and their history; one entry stays.
- Clarify Q2: the demo loads only into empty data (deleted rows count, as they still exist); otherwise
  "Reset and load demo data".
- The confirmation word is "RESET" (typed exactly, case-sensitive).
- After an action the Settings section shows its new state at once and refreshes the page.
- **T024 not done on purpose**: the e2e seed helpers insert directly; switching tests to the UI load
  would make them slower and depend on this feature. Kept as is.

## Fixes made alongside

- `main`'s CI typecheck failed after #17 and #18 merged in parallel (mobile payee mapping missing
  `interestMode`): fixed in PR #19, merged into this branch.
