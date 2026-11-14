# Review notes: Monthly Payment Plan (R7)

Code the constitution requires the owner to review explicitly before merge (Development Workflow
& Quality Gates: authorization/RLS, sync, money). Links are relative to the repository root.

## 1. Two new synced tables: RLS and grants

[20261113000002_plan_tables.sql](../../supabase/migrations/20261113000002_plan_tables.sql),
[20261113000003_plan_rules.sql](../../supabase/migrations/20261113000003_plan_rules.sql)

- `public.plan_items` and `public.plan_occurrences`: RLS on, `select` only for `authenticated`, policy
  `user_id = auth.uid() and app.is_active_user()`. No client insert, update or delete: every write goes
  through `app.apply_changes`.
- Composite foreign keys `(x_id, user_id)` to payees, categories, accounts (the card) and items, so a
  reference can only ever point at the owner's own rows. The pay-from accounts inside `terms` (jsonb)
  cannot have a foreign key: the applier checks each one (below).
- `sync.stamp_row` and `audit.capture_record_change` triggers on both. Audit families are `plan_item`
  and `plan_month` (new target types and actions in
  [20261113000001_plan_enums.sql](../../supabase/migrations/20261113000001_plan_enums.sql)).
- Tests: [plan_rls.test.sql](../../supabase/tests/plan_rls.test.sql) (18): own data only, owner-admin
  reads none, direct writes refused, another user's item / payee / account / category / card / item
  month refused, disabled users read nothing, clients cannot read plan history.

## 2. The two appliers (SECURITY DEFINER, inside `apply_changes`)

[20261113000004_plan_apply.sql](../../supabase/migrations/20261113000004_plan_apply.sql)

- `app._apply_plan_item`, `app._apply_plan_occurrence`; `app._apply_one` dispatches them and maps the
  five new rejection codes. Every statement filters `user_id = p_user` (= `auth.uid()`).
- `app._validate_plan_item`: target fields per target (`INVALID_PLAN_ITEM`); payee kind (business for
  `payee`, person for `person`); expense category; credit-card account; terms are objects with exactly
  four keys, strictly increasing months, the first equal to the start month, a null amount only for card
  bills or varying amounts, due day 1–31, and each pay-from account the caller's and not deleted (only
  checked for entries that are new or changed, so an item whose old account was later deleted can still
  be edited). A card bill cannot be paid from the card itself.
- `terms` is **one field version**: two offline edits resolve latest-wins as a whole (research R7-01).
- **`TERMS_IN_PAST`**: for every month from the later of the old and new start month up to the user's
  "current month", the term in force must be unchanged. The current month is the month of the
  change's HLC time in the user's timezone, never later than the server's and never more than one
  month before it (`app._plan_current_month`), so an edit made offline on the 31st is still accepted
  after midnight and an old clock cannot rewrite older history.
- **`HAS_PAYMENTS`**: a change to start month, end month or frequency/interval that would leave a month
  with a live (non-void) linked payment outside the item's months is refused.
- Item months: the id must equal `app._plan_occurrence_id(item, month)`; the item must be the caller's,
  live, and have that month. A create for an existing id merges per field (only the fields sent carry a
  version — the Zod create schema has no defaults for this reason).
- Tests: [plan_apply.test.sql](../../supabase/tests/plan_apply.test.sql) (31).

## 3. Deterministic occurrence ids (SQL and TypeScript twins)

- SQL `app._plan_occurrence_id` and core
  [`occurrenceId`](../../packages/core/src/plan/months.ts): the item's uuid with its first 32 bits
  XOR-ed with `year × 12 + month index`. It keeps the uuid's version and variant bits.
- Parity: vectors in [plan.json](../../packages/core/test/vectors/plan.json) (values computed in SQL)
  and the integration test [plan-sync.int.test.ts](../../apps/web/lib/plan-sync.int.test.ts) on 50
  random item-months. The same test pushes two offline devices' creates of one item-month and gets one
  row, merged per field.

## 4. Payment links on transactions (`_apply_transaction` replaced)

[20261113000005_plan_links.sql](../../supabase/migrations/20261113000005_plan_links.sql)

- `_apply_transaction` is the R4 function with two added fields, `planItemId` / `planMonth`, which
  share field version `plan` and must be sent together (`INVALID_PLAN_LINK` otherwise). Nothing else in
  the function changed.
- `app._validate_plan_link`: only expenses, transfers and person movements out (`lent`, `repaid_to`,
  `paid_on_behalf`) can link. A link that is set or moved must name the caller's own live item and a
  month the item has. A kept link survives the item's later deletion (paid months stay, FR-008).
- A transaction pays at most one item-month by construction. Re-linking an already-linked transaction
  from the plan is refused on the client (`changes.linkTransaction`, the link dialog shows it disabled
  with "Already pays …"); the transaction's own form can move or remove a link on purpose (research R7-03).
- Delete and void keep the link fields; the plan counts only active, confirmed, non-void links.
- Tests: [plan_links.test.sql](../../supabase/tests/plan_links.test.sql) (23).

## 5. Merges and relocates reach plan items

Same migration: `app._repoint_category` and `app._repoint_payee` (R4) also move `plan_items.category_id`
/ `payee_id`, bumping their field versions so devices pull the change. The return value (moved count
in the relocate history) still counts transactions only. Tested in `plan_links.test.sql`.

## 6. Pull, reset, demo load and erasure

[20261113000006_plan_pull_reset.sql](../../supabase/migrations/20261113000006_plan_pull_reset.sql)

- `app.pull_changes` (still INVOKER) returns `plan_item` and `plan_occurrence`.
- `app._reset_user_data` deletes plan rows (after transactions, before payees and accounts), their
  history, and clears `plan_checked_month`; the reminder setting is kept.
- `app._load_demo` counts the plan tables in its "empty data" rule.
- `app.scrub_user_from_audit` deletes `plan_item` / `plan_month` history; the rows go by cascade with
  the auth user.
- Tests: [plan_data.test.sql](../../supabase/tests/plan_data.test.sql) (12), and
  `data_reset.test.sql` updated for the new counts.

## 7. Preferences: `plan_nudge`, `plan_checked_month`

- Column grant `update (plan_nudge, plan_checked_month)` on the user's own row (existing R1 policy).
- `app.keep_plan_checked_forward` (BEFORE UPDATE trigger): for `authenticated`/`anon` the stored month
  only moves forward and cannot be cleared; definer code (reset) can clear it.
- The API accepts `planCheckedMonth` only as `yyyy-MM-01` (no null); `planNudge` as a boolean. Both
  preference forms (web and Android) leave out fields they do not edit.

## 8. Money code

- **Core** [month.ts](../../packages/core/src/plan/month.ts) `planMonth` / `plannedFor` / `statusOf`:
  bigint paise only. Totals satisfy planned = paid + still to pay − overpaid exactly (asserted on every
  vector view). Carried-over months count only in the current month's totals (SC-005).
- **Estimates** (clarify Q3): a varying item uses last month's paid amount, else the usual amount; a
  varying card bill in the current or coming month uses the card's amount owed now **plus** what is
  already paid that month. Two refinements made while building, worth confirming:
  - a varying item-month with a payment shows **the paid amount** as planned (so a ₹1,800 bill paid
    against a ₹2,000 estimate is Paid, not ₹200 overdue forever);
  - a varying card bill is **not carried over**: what was left unpaid is already in what the card owes
    now, so carrying it would count it twice.
  - A removed item's paid months, and a linked month the item no longer has, show planned = paid.
- **Matching** [match.ts](../../packages/core/src/plan/match.ts): ±20 % compared in integers
  (`100·|a − left| ≤ 20·left`), edges tested at exactly ±20 %.
- **Safe to spend** [reports](../../packages/core/src/reports/index.ts) gains `planUnpaidMinor` from
  `planUnpaidForSafeToSpend`: this month's unpaid items (carried ones included) from accounts counted in
  net worth, **excluding** card bills (card owed is already subtracted) and linked upcoming payments
  dated up to the month's end (R6 already subtracts those). Tested in core and in `r7-nudge.spec.ts`
  (exactly ₹1,000.00 for a new ₹1,000.00 item; nothing for an account outside net worth).

## 9. Reads (no new SECURITY DEFINER reader)

[plan.ts](../../packages/db/src/repositories/plan.ts) reads items, item months, linked transactions
(narrow columns) and match candidates with the user's own client under RLS, paging past the API's
1,000-row limit. The candidates' `or=` filter is built only from ids read from the user's own items.
The server actions in [actions.ts](../../apps/web/app/(app)/payment-plan/actions.ts) validate their input
with Zod, run as the caller, return suggestions only, and log nothing.
