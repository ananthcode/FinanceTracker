# Review notes: Quick-add Templates (R8)

Code the constitution requires the owner to review explicitly before merge (Development Workflow
& Quality Gates: authorization/RLS, sync, money). Links are relative to the repository root.

## 1. New synced table: RLS and grants

[20261114000002_tpl_tables.sql](../../supabase/migrations/20261114000002_tpl_tables.sql)

- `public.transaction_templates`: RLS on, `select` only for `authenticated`, policy
  `user_id = auth.uid() and app.is_active_user()`; no client writes (every write goes through
  `app.apply_changes`).
- Composite foreign keys `(x_id, user_id)` to accounts (both), payees, categories and plan items, so a
  reference can only point at the owner's rows. Tags and split-line references are checked by the applier.
- Table checks: name 1–40 trimmed; no `interest` kind, no `adjustment`; shape per kind (as R4's
  `transactions_shape`); a split needs an amount; unique `lower(name)` among live templates.
- `audit.capture_record_change` is replaced only to add the `template` family to the "reordered" and
  "hidden / unhidden" branches; nothing else changed.
- Tests: [tpl_rls.test.sql](../../supabase/tests/tpl_rls.test.sql) (10).

## 2. The applier (SECURITY DEFINER, inside `apply_changes`)

[20261114000003_tpl_apply.sql](../../supabase/migrations/20261114000003_tpl_apply.sql)

- `app._apply_template` with `app._validate_template` (R4's `_validate_transaction` rules for a row without
  a date): accounts the caller's and not deleted (active when new or moved); payee the caller's live one,
  a person for person movements; category of the right kind, none on a split; split lines 2–50, each the
  caller's category or person, adding up exactly to the amount; tags the caller's live ones (≤ 20).
- Amount and split lines share one field version, as R4. `kind` never changes.
- **The tie** (clarify Q1): `plan_item_id` may be set only to the caller's live planned payment paid the
  way the template pays (R7's rule: same payee for a payee item, a transfer into the card for a card bill,
  a person movement out to the person) — checked when the tie is set or changed.
- `LIMIT_REACHED` at 100 live templates; `NAME_TAKEN` from the unique index (mapped in `_apply_one`).
- `app._apply_one` is R7's with the `template` dispatch and the `INVALID_TEMPLATE` code added.
- Tests: [tpl_apply.test.sql](../../supabase/tests/tpl_apply.test.sql) (19).

## 3. Merges, relocate and tag delete; pull, reset, demo load, erasure

[20261114000004_tpl_repoint_pull_reset.sql](../../supabase/migrations/20261114000004_tpl_repoint_pull_reset.sql)
— generated from the R4/R7 functions with template statements added (the script kept every other line
identical).

- `_repoint_category`, `_repoint_payee`, `_repoint_tag` also move templates' category, payee, split lines
  and tags, bumping field versions so devices pull the change (FR-015).
- `pull_changes` (still INVOKER) returns `template`; `_reset_user_data` deletes templates (and their
  history) and reports `templates`; `_load_demo` counts them for "empty data"; `scrub_user_from_audit`
  deletes their history (rows go by cascade with the auth user).
- Tests: [tpl_data.test.sql](../../supabase/tests/tpl_data.test.sql) (11); `data_reset.test.sql` expects
  the new count.

## 4. Recording path (money)

- A recording is an **ordinary R4 transaction create** built by core
  [`recordFromTemplate`](../../packages/core/src/templates/rules.ts) and pushed through the same endpoint
  (FR-007): the R4 applier validates it like any transaction; it keeps no template id (FR-006).
- The amount is the box's, parsed to exact paise by `readAmountBox` (empty, invalid and ≤ 0 refused; a
  split's amount can only change in the form, so its lines still add up).
- A tied template sends R7's `planItemId` / `planMonth` for the month core `tiedPlanMonth` picks (oldest
  carried-over month with something left, else this month); R7's `INVALID_PLAN_LINK` rules still apply.
- Undo pushes the R4 delete of that transaction; the repeat check and Undo window are client-side (10 s).

## 5. Reads

[templates.ts](../../packages/db/src/repositories/templates.ts) reads with the user's client under RLS.
[templates-data.ts](../../apps/web/lib/templates-data.ts) works out each template's tie and missing
references on the server, using the plan loader from R7. No new SECURITY DEFINER reader.

## 6. Shared form

The R4 [TransactionForm](../../apps/web/components/transactions/TransactionForm.tsx) gained a `template`
mode (no date, time, status or reference; optional amount; name; tie) and starting values from a
template ("Edit first" and "Start from a template"). Its transaction behaviour is unchanged: R4–R7
browser tests pass. One fix found by the tests: following a template link on the add form now resets the
form (it is keyed by what it was opened with).
