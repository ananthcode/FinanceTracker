# Review notes: Transactions (R4)

Code the constitution requires the owner to review explicitly before merge (Development Workflow
& Quality Gates: authorization/RLS, sync and money). Each item says what to check and which tests
prove it. Links are relative to the repository root. Items marked **Owner** need a decision.

## 1. Writes through `app.apply_changes` (SECURITY DEFINER)

[20261101000005_tx_apply.sql](../../supabase/migrations/20261101000005_tx_apply.sql),
[20261101000009_tx_payee_interest.sql](../../supabase/migrations/20261101000009_tx_payee_interest.sql),
[20261101000011_tx_relocate.sql](../../supabase/migrations/20261101000011_tx_relocate.sql)

The appliers bypass row-level security, so check that:

- `app._validate_transaction` accepts only the caller's own **active** accounts (`ACCOUNT_INACTIVE`
  for archived ones on new entries or a changed account), categories of the right kind
  (`INVALID_CATEGORY`), person payees for person movements and person shares (`INVALID_PERSON`), and
  the caller's tags. Every reference is checked with `user_id = p_user`; composite foreign keys on
  `(id, user_id)` enforce the same in the table, whatever the code does.
- Dates before an account's or person's opening date are refused (`DATE_BEFORE_OPENING`), and an
  opening date can no longer move after existing transactions (guards in
  [20261101000004_tx_rules.sql](../../supabase/migrations/20261101000004_tx_rules.sql)).
- The amount and split lines share one field version, so they win or lose together (R4-01); the lines
  must add up (`LINES_MISMATCH`); a future date forces `confirmed = false`; editing a generated
  interest entry's amount sets `user_edited`, which stops recomputation.
- **Relocate** (`app._relocate`) checks both rows are the caller's and of the same kind
  (`INVALID_MERGE`), moves transactions and split lines, keeps the source and writes a
  `category_relocated` / `payee_relocated` history row with the count.
- **R3 merges and tag delete now reach transactions** through the trigger `app._list_row_deleted`
  (R3 review item 1): merged categories and payees are repointed in transactions and lines; a merged
  tag is replaced (never twice); a deleted tag is removed. A person target refuses movements before
  its opening date; an interest month the target already has stays with the source.
- `app._apply_payee` was replaced to accept `interestMode` (see Fixes). A person who becomes a
  business goes back to "none" (the table check keeps businesses without interest).
- Every helper is revoked from clients (end of each migration).

Tests: [tx_apply.test.sql](../../supabase/tests/tx_apply.test.sql) (54),
[tx_relocate.test.sql](../../supabase/tests/tx_relocate.test.sql) (16),
[tx_rls.test.sql](../../supabase/tests/tx_rls.test.sql) (19), and the sync integration tests
[tx-sync.int.test.ts](../../apps/web/app/api/sync/tx-sync.int.test.ts) (another user's ids rejected;
logs carry no amounts or notes; 50 offline changes from two devices).

## 2. Tables, RLS and grants

[20261101000002_tx_tables.sql](../../supabase/migrations/20261101000002_tx_tables.sql)

- `public.transactions` and `public.person_rates`: RLS select-own for active users only; clients have
  SELECT only (no direct writes — tested); the owner-admin reads none.
- `private.transaction_postings` has no grants at all: clients cannot read it (tested). Balances reach
  screens only through the SECURITY DEFINER readers in item 3.
- Erasing a user removes their transactions, rates, postings and transaction history (tested).

## 3. SECURITY DEFINER readers and the interest proposer

- `app.balance_movements()` ([…08](../../supabase/migrations/20261101000008_tx_balance_movements.sql)):
  every account's and person's counted total, filtered on `auth.uid()` twice (the row and the
  posting); refuses disabled users (tested in `tx_rls`).
- `app.account_balance_minor` / `app.person_balance_minor` stay **service_role only** (no owner check
  inside, so they must never be granted to clients).
- `app.search_transactions` and `app.to_confirm_count` are SECURITY **INVOKER**: RLS applies on top
  of their own user filter ([tx_search.test.sql](../../supabase/tests/tx_search.test.sql), 18).
- `app.propose_interest()` ([…10](../../supabase/migrations/20261101000010_tx_interest.sql)) runs for
  `auth.uid()` and decides "today" itself in the user's timezone; the worker
  `app._propose_interest(user, today)` is **service_role only**, so nobody can ask for months that have
  not ended (tested). Per-user advisory lock plus the unique index `transactions_interest_once`: at
  most one proposal per person and month, ever — a deleted one is never recreated
  ([tx_interest.test.sql](../../supabase/tests/tx_interest.test.sql), 15).

## 4. Money

- Amounts are `bigint` paise everywhere; the web parses input exactly (`parseAmountInput`), never
  through floating point; rates are integers (% × 10⁴) parsed exactly from text.
- **Postings** (`app._rebuild_postings`, [tx_postings](../../supabase/migrations/20261101000003_tx_postings.sql))
  are the SQL twin of core `postingsOf`; held accounts rise with money in, owed accounts the opposite;
  counted = active, confirmed, not void. Parity: `transactions.json` gives the same balances in SQL
  and core ([sync-parity.int.test.ts](../../apps/web/lib/sync-parity.int.test.ts)).
- **Interest**: `round(opening × rate / 10⁶)` half away from zero (`numeric` in SQL, exact `bigint`
  in core); `interest.json` (compounding over 24 months, half-paisa both ways, rate changes, existing
  proposals) gives the same proposals in SQL and core (parity test).
- Totals: transfers, person movements and interest are in no spending or income
  (`categoryTotals`, unit-tested); the list's net total leaves out transfers and void entries.

## 5. History and erasure

- Every create, edit, confirm and delete of a transaction or rate is in the append-only history
  (`transaction_confirmed` is named); relocations are recorded on the source
  ([tx_audit.test.sql](../../supabase/tests/tx_audit.test.sql)). Server-made interest proposals are
  `transaction_created` rows whose changes show `generated` and `interest_month`.
- Logs never contain amounts, notes, payees or categories (integration test spies on the console).

## 6. Data access and API

- Web reads go through the user's own client (RLS). The list's "Load more"
  ([actions.ts](../../apps/web/app/(app)/transactions/actions.ts)) and the tag usage count
  ([settings/tags/actions.ts](../../apps/web/app/(app)/settings/tags/actions.ts)) are server actions
  that validate their input with Zod and read with the caller's client.
- `POST /api/interest/propose` ([route.ts](../../apps/web/app/api/interest/propose/route.ts)): signed
  in only, 30 a minute per user, logs nothing about people or amounts (integration-tested).
- Bulk edits are ordinary sync changes (one per transaction, chunks of 100), so each is validated and
  recorded like a single edit.

## Decisions and interpretations

- **Owner — rate changes and waiting proposals (US4 scenario 4 vs FR-014).** A proposal that is still
  waiting (not confirmed, edited or deleted) is recomputed from the month's opening balance *and the
  rate history as it is now*. Adding or removing a rate for a month that has ended therefore changes
  that month's waiting proposal; confirmed, edited and deleted proposals never change. Freezing the
  rate each proposal was made with needs a rate column on proposals. Recommendation: keep as built
  (waiting means "not decided yet").
- A waiting proposal that recomputes to ₹0.00 is withdrawn (soft-deleted), since amounts are at least
  ₹0.01; like any deleted proposal it is not recreated for that month.
- Months that get interest start with the first month beginning on or after the person's opening date
  and need a rate in force on their 1st.
- Proposals run on every full page load (signed-in layout) and on the Transactions and person pages
  (a shared layout is not re-rendered on client navigation). Android calls the HTTP route.
- Postings live in `private.transaction_postings` (the plan said `app`).
- Hide balances: lists, totals and balances are masked on every transaction screen; the amount field
  of a form being edited shows its value (as R2's account form), so you see what you change.
- Bulk changes skip transactions they do not fit (a category of the other kind, a split, a transfer's
  payee) and say how many.
- Demo data (`demoTransactions(today)`) runs from 01-Apr-2025 to today's month (about 14 a month);
  Meera Iyer is now the demo's manual-interest person.
- Search, the To-confirm count and the nav badge were built with US1 (T047 early).

## Fixes found while testing

- **Payee creates were refused** once core sent `interestMode` by default: the R3 SQL write path did
  not allow it, so every payee and person add failed. Fixed in `…09_tx_payee_interest.sql` (pgTAP +
  integration test).
- **`Dialog` rendered its portal on the server** (R3): a dialog open on first render (the categories
  start choice) threw "document is not defined" there. It now renders once in the browser.
- **Android `applyLocally`** did not handle the new `relocate` change kind (typecheck failure after
  merging `main`).
- Several e2e steps clicked before the page was interactive; they now retry until the page reacts.

## Carried to the Android phase (`ft-side`)

- T053 local store tables and screens for transactions and rates; T054 a push notification for "To
  confirm". The server side of offline sync (T052) is done and tested.
