---

description: "Task list for R4 — Transactions"
---

# Tasks: Transactions

**Input**: Design documents from `/specs/004-transactions/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (sync-protocol.md,
database.md, http-api.md, client-transactions.md), quickstart.md

**Tests**: Included (constitution IX; SC-002, SC-004, SC-005, SC-007, SC-009). Write each phase's
tests first.

**Organization**: by user story. Stories 1–7 on the web now; Story 8's Android client is deferred
(server side built and tested now).

## Format: `[ID] [P?] [Story] Description`

Migration names `YYYYMMDDHHMMSS_*` (`<ts>`), in the listed order. Paths as R3.

---

## Phase 1: Setup

- [X] T001 [P] Add `DATE_BEFORE_OPENING`, `LINES_MISMATCH`, `ACCOUNT_INACTIVE`, `INVALID_PERSON`, `INVALID_CATEGORY` to `ERROR_CODES` (`packages/core/src/schemas/common.ts`) and `REJECTION_CODES` (`packages/core/src/sync/schemas.ts`)
- [ ] T002 [P] Create `packages/core/src/transactions/index.ts` and `packages/core/src/interest/index.ts` barrels and export them from `packages/core/src/index.ts`

## Phase 2: Foundational

### Tests first

- [X] T003 [P] Unit tests `packages/core/test/transaction-schemas.test.ts`: every kind's required fields; amount "1…999999999999 paise" as decimal strings; `kind` create-only; person action must match flow; lines 0 or 2–50 with category xor person; `amountMinor` and `lines` must travel together in updates; notes ≤ 1,000, reference ≤ 40; server-controlled fields (`generated`, `interestMonth`, `userEdited`, `state`, `fieldVersions`, `serverSeq`) rejected; `relocate` takes exactly `{ targetId }`; person-rate `effectiveMonth` day 1 and `rateE4` 0–100000
- [X] T004 [P] Shared vectors `packages/core/test/vectors/transactions.json` (each kind × held/owed account; refund; transfer bank → card; person actions both flows incl. a balance that flips; adjustment; interest; split with category and person lines; void; unconfirmed; maximum amount) with expected postings, account balances, person balances, spending/income per category; tests `packages/core/test/postings.test.ts` (SC-002)
- [ ] T005 [P] pgTAP `supabase/tests/tx_rls.test.sql`: contracts/database.md rules 1–6 (SC-004)
- [ ] T006 [P] pgTAP `supabase/tests/tx_audit.test.sql`: create / edit / confirm / delete rows with before/after, device type, owner; postings changes not audited; relocate recorded (SC-005)

### Core

- [X] T007 [P] `packages/core/src/transactions/schemas.ts`: `TransactionCreateFields`, `TransactionUpdateFields`, `PersonRateFields`, `RelocateFields`, read models `TransactionView`, `PersonRateView` — passes T003
- [X] T008 Register `transaction` and `person_rate` entities, `relocate` kind for `category`/`payee`, pull rows, in `packages/core/src/sync/schemas.ts` — passes T003
- [X] T009 `packages/core/src/transactions/postings.ts`: `postingsOf`, `movementsOf`, `personMovementsOf`, `isCounted` (research R4-02, R4-03) — passes T004

### Database

- [ ] T010 Migration `<ts>_tx_enums.sql`: enums and audit actions (data-model.md); `target_type` gains `transaction`, `person_rate`
- [ ] T011 Migration `<ts>_tx_tables.sql`: `public.transactions`, `public.person_rates`, `app.transaction_postings`, `payees.interest_mode` exactly per data-model.md (checks, composite FKs to accounts/payees/categories within the user, generated-interest unique index across states, GIN on `tag_ids`); RLS select-own; SELECT grants only (none on postings); stamp + audit triggers
- [ ] T012 Migration `<ts>_tx_postings.sql`: `app._rebuild_postings()` trigger (after insert/update on transactions) implementing research R4-02/R4-03 exactly like `postingsOf`
- [ ] T013 Migration `<ts>_tx_rules.sql`: replace `app.account_balance_minor`, `app.person_balance_minor`, `app.account_has_activity`, `app.category_has_activity`, `app.payee_has_activity`, `app.tag_usage_count` to read postings/transactions; refuse an account or person opening date moved after an existing transaction (`DATE_BEFORE_OPENING`)
- [ ] T014 Migration `<ts>_tx_apply.sql`: `app._apply_transaction` (create/update/delete; validation per contracts/sync-protocol.md; amount+lines shared version; future date → unconfirmed; editing a generated amount sets `user_edited`), `app._apply_person_rate`; dispatch in `_apply_one`; new codes mapped — passes T005, T006
- [ ] T015 Migration `<ts>_tx_pull_erasure.sql`: pull includes transactions and person rates; erasure deletes their history
- [ ] T016 `pnpm db:types`; `pnpm db:test` green

### Data access

- [ ] T017 [P] `packages/db/src/repositories/transactions.ts`: `getTransaction`, `searchTransactions` (wraps `app.search_transactions`), `toConfirmCount`, `listPersonRates`; money as text → bigint; paging past 1,000 rows where lists are read
- [ ] T018 [P] Sync client builders in `apps/web/lib/sync-client.ts` (`createTransaction`, `updateTransaction`, `deleteTransaction`, `confirmTransactions`, `createPersonRate`, `updatePersonRate`, `deletePersonRate`, `relocateCategory`, `relocatePayee`)
- [ ] T019 [P] Integration `apps/web/app/api/sync/tx-sync.int.test.ts`: push/pull of transactions; two devices editing amount+lines and other fields (lines win or lose together); duplicate delivery; another user's ids rejected; logs carry no amounts or names
- [ ] T020 [P] Parity `apps/web/lib/sync-parity.int.test.ts`: `transactions.json` against postings and balance functions

---

## Phase 3: User Story 1 — Record spending and income (P1) 🎯 MVP

- [ ] T021 [P] [US1] pgTAP `tx_apply.test.sql` (US1 part): expense/income/refund effects on held and owed accounts; category kind checks; Uncategorised; archived account refused for new; date before opening refused; future date → unconfirmed and not counted; confirm counts from its date; void not counted; amount bounds
- [ ] T022 [P] [US1] Unit `packages/core/test/transaction-labels.test.ts`: `transactionLabel` words per kind/action/direction
- [ ] T023 [P] [US1] Playwright `apps/web/e2e/r4-us1-record.spec.ts`: spec US1 scenarios 1–9, quickstart S1-a … S1-e, SC-001 (< 20 s)
- [ ] T024 [US1] `packages/core/src/transactions/labels.ts` (`transactionLabel`) and `totals.ts` (`categoryTotals` with roll-up, Uncategorised) — passes T022
- [ ] T025 [US1] Components (new entries offer only active accounts, unhidden payees and categories — FR-006; an existing transaction keeps showing what it uses) `apps/web/components/transactions/PayeeCombobox.tsx` (search, create new business/person inline), `TagPicker.tsx` (multi-select, create inline), `TransactionForm.tsx` (type tabs; Expense/Income/Refund fields; default category from payee; date with Upcoming note; optional time; notes; reference; status)
- [ ] T026 [US1] Pages `apps/web/app/(app)/transactions/page.tsx` (list newest first, Load more, To confirm section), `new/page.tsx`, `[id]/page.tsx`; `TransactionRow.tsx`, `ToConfirm.tsx` (confirm one / all); nav badge "N to confirm" in `apps/web/components/shell/` using `toConfirmCount`; replace the R1 placeholder and update `us5-shell.spec.ts`
- [ ] T027 [US1] Account page `apps/web/app/(app)/accounts/[id]/page.tsx` lists the account's latest transactions; accounts summary counts transactions (balances via `app.account_balance_minor` parity); `AccountForm` explains `DATE_BEFORE_OPENING` when the opening date is moved after existing transactions — passes T023

## Phase 4: User Story 2 — Transfers (P1)

- [ ] T028 [P] [US2] pgTAP (US2 part): transfer effects held→owed, owed→held; same account refused; another user's to-account refused; transfers in no category totals
- [ ] T029 [P] [US2] Playwright `apps/web/e2e/r4-us2-transfer.spec.ts`: spec US2 1–3, S2-a, SC-001
- [ ] T030 [US2] Transfer tab in `TransactionForm` (from/to accounts, amount, date, notes) — passes T029

## Phase 5: User Story 3 — People (P1)

- [ ] T031 [P] [US3] pgTAP (US3 part): every person action's effect and flow check; business refused (`INVALID_PERSON`); adjustment without account requires notes (reason); person date rule; balance flips; none in totals; person → business refused once movements exist
- [ ] T032 [P] [US3] Playwright `apps/web/e2e/r4-us3-people.spec.ts`: spec US3 1–4 and 6, S3-a (scenario 5 in US5's test)
- [ ] T033 [US3] Person tab in `TransactionForm` (action select with plain words, person combobox limited to people, account except for adjustment, reason for adjustment); person page `apps/web/app/(app)/people/[id]/page.tsx` lists the person's movements with running balance; `PayeeForm` explains `DATE_BEFORE_OPENING` for a person's opening date

## Phase 6: User Story 4 — Interest (P2)

- [ ] T034 [P] [US4] Vectors `packages/core/test/vectors/interest.json` (rates from different months, 0 %, rate changes, compounding over 24 months, movements mid-month, flips, half-paisa rounding, confirmed in random order) and `packages/core/test/interest.test.ts` (SC-007)
- [ ] T035 [P] [US4] pgTAP `tx_interest.test.sql`: proposals once per person per month (also two concurrent calls); deleted proposal never recreated; edited proposal not recomputed; unconfirmed proposals recompute in month order; manual mode creates none; rate day-1 rule; other users untouched
- [ ] T036 [P] [US4] Integration parity: `interest.json` against `app.propose_interest` results
- [ ] T037 [P] [US4] Playwright `apps/web/e2e/r4-us4-interest.spec.ts`: spec US4 1–5 (month ends simulated by back-dated rates and opening balances)
- [ ] T038 [US4] `packages/core/src/interest/amount.ts`, `propose.ts` — passes T034
- [ ] T039 [US4] Migration `<ts>_tx_interest.sql`: `app._interest_amount`, `app._month_opening_balance`, `app.propose_interest()` — passes T035, T036
- [ ] T040 [US4] `POST /api/interest/propose` (`apps/web/app/api/interest/propose/route.ts`, rate limit 30/min) called once per page load from the signed-in layout; person page: interest mode, rate history editor, "Record interest" — passes T037

## Phase 7: User Story 5 — Splits (P2)

- [ ] T041 [P] [US5] pgTAP (US5 part): lines must add up (`LINES_MISMATCH`); 1 line or > 50 refused; category kind per line; person lines' action matches flow; postings per line
- [ ] T042 [P] [US5] Playwright `apps/web/e2e/r4-us5-splits.spec.ts`: spec US5 1–2, US3 scenario 5, S3-b, S5-a
- [ ] T043 [US5] `SplitEditor.tsx` (add/remove lines, category or person share, amount left to allocate, keyboard operable) in `TransactionForm` — passes T042

## Phase 8: User Story 6 — Find, filter, fix (P2)

- [ ] T044 [P] [US6] pgTAP `tx_search.test.sql`: each filter; category roll-up; Uncategorised; text over payee/category names, notes, reference; keyset paging without gaps; count and total; RLS via INVOKER
- [ ] T045 [P] [US6] pgTAP (relocate part) in `tx_apply.test.sql`: relocate category (and lines) and payee keep the source; kinds must match; R3 merges now repoint transactions, lines and tags; tag delete removes from transactions; activity blocks deletes
- [ ] T046 [P] [US6] Playwright `apps/web/e2e/r4-us6-find.spec.ts`: spec US6 1–5, S6-a, S-del
- [ ] T047 [US6] Migration `<ts>_tx_search.sql`: `app.search_transactions`, `app.to_confirm_count` — passes T044
- [ ] T048 [US6] Migration `<ts>_tx_relocate.sql`: `relocate` for categories and payees; extend R3 merges and tag delete — passes T045
- [ ] T049 [US6] `FilterPanel.tsx`, search box, count/total, selection and `BulkBar.tsx` (category, payee, status, add/remove tags, delete; chunked pushes); Relocate actions in Settings › Categories and Payees; `TagList` delete confirmation shows the real number of transactions using the tag (FR-021) — passes T046

## Phase 9: User Story 7 — Statuses and corrections (P3)

- [ ] T050 [P] [US7] Playwright `apps/web/e2e/r4-us7-status.spec.ts`: spec US7 1–2, S7-a
- [ ] T051 [US7] Status control in the form and list; Void styling and exclusion — passes T050

## Phase 10: User Story 8 — Offline on Android (P3)

- [ ] T052 [P] [US8] Integration (server side, now): 50 offline changes across two devices incl. conflicting amount+lines and fields; 0 lost or duplicated; balances identical after pull (SC-008 server side)
- [ ] T053 [US8] *Deferred* Android local store tables and screens for transactions and rates
- [ ] T054 [US8] *Deferred* Android push notification for "To confirm"

## Phase 11: Polish

- [ ] T055 [P] Accessibility: extend `apps/web/e2e/a11y.spec.ts` to `/transactions` (list, filters, bulk bar, To confirm), `/transactions/new` (each tab, split editor), the person interest editor (axe at 1280/390 px, keyboard)
- [ ] T056 [P] Performance `apps/web/e2e/r4-performance.spec.ts` (E2E_PRODUCTION): 20,000 transactions, list < 2 s, search/filter < 1 s (SC-003)
- [ ] T057 [P] Demo `packages/core/src/demo/transactions.ts` (research R4-10) with `packages/core/test/demo-transactions.test.ts`; `seedTransactions` e2e helper; hide-balances screens list gains transaction screens (SC-006)
- [ ] T058 Write `specs/004-transactions/review-notes.md`
- [ ] T059 Run every suite; write `specs/004-transactions/validation.md`
- [ ] T060 Converge: contracts, ROADMAP status, Android tasks carried to the Android phase

## Dependencies

Setup → Foundational → US1 (MVP) → US2 → US3 → US4 / US5 → US6 → US7 → US8 server → Polish.
US3 scenario 5 (person share in a split) is tested in US5.

## Notes

- The R1 Transactions placeholder is replaced in US1; `us5-shell` and `a11y` tests update with it.
- R2/R3 activity placeholders are replaced in T013; their R2/R3 tests that assumed "no activity" must
  keep passing (they create no transactions).
