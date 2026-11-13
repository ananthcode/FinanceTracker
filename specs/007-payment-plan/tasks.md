---

description: "Task list for R7 — Monthly payment plan"
---

# Tasks: Monthly Payment Plan

**Input**: Design documents from `/specs/007-payment-plan/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (sync-protocol.md,
http-api.md, client-plan.md), quickstart.md

**Tests**: Included (constitution IX; SC-001, SC-002, SC-003, SC-005, SC-006, SC-007, SC-008). Tests
come first.

**Organization**: by user story. Stories 1–5 are on the web now; Story 6 (Android) is deferred, except
that the mobile row mappers learn the new fields (T005).

## Format: `[ID] [P?] [Story] Description`

Migration names are `20261113000NNN_*` (`<ts>`), in the listed order.

---

## Phase 1: Setup (schema and shapes)

- [X] T001 Migration `<ts>_plan_enums.sql` in `supabase/migrations/`: enums `plan_frequency` (`monthly`, `every_n_months`, `yearly`, `one_off`) and `plan_target` (`payee`, `card`, `person`); audit actions `plan_item_created`, `plan_item_edited`, `plan_item_deleted`, `plan_month_edited`; target types `plan_item`, `plan_occurrence`
- [X] T002 Migration `<ts>_plan_tables.sql`. Every rule is listed in data-model.md.
  - `public.plan_items`, with checks:
    - `name` 1–60 chars;
    - target fields per `target`;
    - `interval_months` per `frequency`;
    - `start_month` and `end_month` on day 1, and `end_month ≥ start_month`;
    - `terms` is a non-empty array (≤ 120 entries);
    - `notes` ≤ 500 chars.
  - `public.plan_occurrences`: `amount_minor` 0 … 999999999999 or null; unique `(item_id, month)`.
  - `transactions.plan_item_id` and `plan_month`: both null or both set; partial index
    `(user_id, plan_item_id, plan_month) where plan_item_id is not null`.
  - `user_preferences.plan_nudge` (`boolean not null default true`) and `plan_checked_month`
    (`date null`, day 1).
  - Composite FKs `(x_id, user_id)`.
  - Indexes `plan_items (user_id, state)` and `plan_occurrences (user_id, month)`.
- [X] T003 Migration `<ts>_plan_rules.sql`:
  - RLS select-own for active users and SELECT-only grants on both tables;
  - `sync.stamp_row` and `audit.capture_record_change` triggers;
  - the preferences column grant `update (plan_nudge, plan_checked_month)`, plus a `before update`
    trigger keeping `plan_checked_month = greatest(old, new)` (reset and erasure must still clear it);
  - `app._plan_occurrence_id(item uuid, month date)` (research R7-02).
- [X] T004 [P] Core shapes in `packages/core/src/plan/schemas.ts`:
  - Zod schemas for the plan item (create and update), occurrence and term;
  - `PlanItem` and `PlanOccurrence` views;
  - transaction schema and view gain `planItemId` and `planMonth`;
  - the sync entity union gains `plan_item` and `plan_occurrence` in
    `packages/core/src/sync/schemas.ts`;
  - `PreferencesSchema` gains `planNudge` and `planCheckedMonth` in
    `packages/core/src/schemas/me.ts`;
  - export from `packages/core/src/index.ts`.
- [X] T005 [P] Clients learn the new fields (R4 lesson):
  - `packages/db/src/repositories/preferences.ts` and `transactions.ts` mappers, `sync.ts` pull rows;
  - the mobile `apps/mobile/src/lib/sync/transactions.ts` row mapper, plus a new
    `apps/mobile/src/lib/sync/plan.ts` row mapper with store tables (no screens);
  - the web and mobile preferences forms omit fields they do not edit.
- [X] T006 `pnpm db:types` (regenerates `packages/db/src/types.gen.ts`)

## Phase 2: Foundational (core rules, appliers, sync)

- [X] T007 [P] Vectors in `packages/core/test/vectors/plan.json`, run by `packages/core/test/plan.test.ts`. They cover:
  - **Months and terms:**
    - `occurrenceId` cases;
    - `appliesIn` for each frequency, start and end months, and a one-off;
    - due day 31 in February and in 30-day months;
    - `termFor` and `editTerms` (from the viewed month; refused before the current month).
  - **Planned amounts (`plannedFor`):** set amount, usual amount, varying estimate from last month's
    paid amount, card owed + paid in the current and coming month, and "Amount not set".
  - **`planMonth`:**
    - every status, including part paid + overdue and days late;
    - totals where planned = paid + left − overpaid;
    - unconfirmed, void and deleted links not counted;
    - carried over counted only in the current month (SC-005);
    - removed items with links, and a linked month the item no longer applies to (still shown);
    - per-account cash: balance, card available credit, short by;
    - previous-month comparison;
    - "today" at the user's timezone midnight boundary.
  - **Zero and very large amounts.**
- [X] T008 Core `packages/core/src/plan/months.ts` (`occurrenceId`, `appliesIn`, `termFor`, `dueDate`, `editTerms`) and `packages/core/src/plan/month.ts` (`plannedFor`, `planMonth`) — passes T007
- [X] T009 [P] pgTAP `supabase/tests/plan_apply.test.sql` and `plan_rls.test.sql` (with helpers in `supabase/tests/04_plan_helpers.sql`):
  - **Isolation:** own data only. Another user's item, account, payee or category is refused as
    `INVALID_PLAN_ITEM`. The owner-admin cannot read.
  - **Item checks:** wrong target fields, a card bill's pay-from set to the card itself, and terms
    out of order are refused.
  - **Terms and months:**
    - `TERMS_IN_PAST`, measured at the change's HLC month, with a 31st-of-month offline edit
      accepted after midnight and an HLC two months old refused;
    - `HAS_PAYMENTS` when the start month, end month, frequency or interval would drop a linked
      month.
  - **Occurrences:**
    - `INVALID_OCCURRENCE` for a wrong id or a month the item does not apply to;
    - a create for an existing occurrence merges per field;
    - conflicting updates resolve latest-wins.
  - **Audit:** rows for create, edit, delete and month edits.
- [X] T010 Migration `<ts>_plan_apply.sql`:
  - `app._apply_plan_item` and `app._apply_plan_occurrence` (validation, field versions — `terms` as
    one field — and soft delete);
  - `app._apply_one` dispatches the new entities;
  - passes T009.
- [X] T011 [P] pgTAP `supabase/tests/plan_links.test.sql`:
  - **Linking:** a transaction create or update with `planItemId` and `planMonth` links.
  - **Refused as `INVALID_PLAN_LINK`:**
    - a foreign or deleted item, or a month outside its range;
    - income, refund, interest, adjustment or person-in transactions;
    - only one of the two fields set.
  - **Field version:** `plan` is shared by both fields.
  - **Keeping links:** unlinking keeps the other fields; delete and void keep the link fields.
  - **Merges:** a payee or category merge or relocate repoints `plan_items.payee_id` and
    `category_id`.
- [X] T012 Migration `<ts>_plan_links.sql`:
  - `app._apply_transaction` accepts `planItemId`/`planMonth` with the R7-03 rules;
  - `app._repoint_payee` and `app._repoint_category` also update `plan_items`, bumping field
    versions;
  - passes T011.
- [X] T013 [P] pgTAP `supabase/tests/plan_data.test.sql`:
  - pull returns both entities (including deleted rows) and the transaction link fields;
  - `reset_my_data` and erasure remove items and occurrences and clear the preferences;
  - `scrub_user_from_audit` covers the new target types;
  - the preference grant only lets the checked month move forward.
- [X] T014 Migration `<ts>_plan_pull_reset.sql`:
  - `app.pull_changes` gains `plan_item` and `plan_occurrence`;
  - `app._reset_user_data` and the erasure functions include the new tables and preference columns;
  - passes T013.
- [ ] T015 [P] Integration `apps/web/lib/plan-sync.int.test.ts`: push/pull round trip for both entities; `occurrenceId` TS = `app._plan_occurrence_id` on 50 random pairs; `/api/me` returns `planNudge: true`, `planCheckedMonth: null`; `PATCH /api/me/preferences` with `planCheckedMonth` stores the later month
- [ ] T016 Changes builders in `apps/web/lib/sync-client.ts` (`changes.createPlanItem`, `updatePlanItem`, `deletePlanItem`, `setPlanMonth`, `linkTransaction`, `unlinkTransaction`) and repository `packages/db/src/repositories/plan.ts` (`planItems`, `planOccurrences(months)`, `planLinks(upTo)`, `planCandidates(from, to, payeeIds, cardIds)`) — passes T015

## Phase 3: User Story 1 — This month's plan on one screen (P1) 🎯 MVP

**Goal**: The Payment plan screen shows a month's items with statuses and exact totals, and month navigation.

**Independent Test**: With the demo household, this month lists items by due date with the right statuses, and planned = paid + still to pay.

- [ ] T017 [P] [US1] Core `packages/core/src/demo/plan.ts` + `demo/changes.ts` wiring (R7-11): demo items (2 EMIs, rent, 2 card bills amount varies, school fees every 3 months, yearly car insurance, a person repayment, a subscription), past months linked to existing demo transactions, one item unpaid last month; vectors in `packages/core/test/demo.test.ts` updated (deterministic, links valid)
- [ ] T018 [P] [US1] Playwright `apps/web/e2e/r7-us1-plan.spec.ts` with a fixed clock: US1 1–4, S1-a, S1-b (statuses in words, totals add up, ‹ › months, range limits, empty state with "Add a planned payment")
- [ ] T019 [US1] `apps/web/app/(app)/payment-plan/page.tsx` (replaces `ComingSoon`), `components/plan/PlanMonth.tsx`, `PlanRow.tsx`, `PlanTotals.tsx` (ids per contracts/client-plan.md; `<Money>`; `?month=`) — passes T018
- [ ] T020 [US1] Update `apps/web/e2e/us5-shell.spec.ts` (Payment plan is a real screen) and `us7-hide-balances.spec.ts` (plan amounts masked)

## Phase 4: User Story 2 — Set up planned payments (P1)

**Goal**: The user can add, edit from a month, set a month's amount, skip, end and delete items, with estimates for varying amounts.

**Independent Test**: The S2 items appear in exactly their months, a month's amount changes only that month, and an edit from next month leaves this month unchanged.

- [ ] T021 [P] [US2] Playwright `apps/web/e2e/r7-us2-items.spec.ts`: US2 1–7, S2-a–S2-c (frequencies, set amount, one-off from a month view, "Apply from" default = viewed month and min = current month, end, skip, delete warning with paid months kept as "removed", estimated label)
- [ ] T022 [US2] `apps/web/app/(app)/payment-plan/new/page.tsx`, `[id]/page.tsx`, `components/plan/ItemForm.tsx` (target picker: payee + category / credit card / person + action; Amount varies; due day; from account; frequency with N; start/end month; notes; "Apply from" on edit) and row actions Set amount / Skip / Undo skip / End in `PlanRow.tsx` via `actions.ts` — passes T021

## Phase 5: User Story 3 — Pay or link, never twice (P1)

**Goal**: Pay pre-fills and links. Link existing, "Looks paid — link?" and "Pays:" in the add form also link. Part payments are supported, and the transaction screen shows the link.

**Independent Test**: Pay on Rent creates one transaction and Rent becomes Paid; linking marks an item Paid without creating a transaction; balances change once.

- [ ] T023 [P] [US3] Core vectors added to `packages/core/test/vectors/plan.json` for `likelyMatches`, `paysSuggestions` and `payDraft`:
  - target matching for payees, cards and people;
  - the ±20 % amount rule in integers, with edges at exactly 20 %;
  - the date window (10 days around the due date, or in the item's month);
  - best match first;
  - already-linked transactions left out;
  - drafts for payee, card and person items;
  - an archived account or a deleted payee leaves that field empty.
- [ ] T024 [US3] Core `packages/core/src/plan/match.ts` — passes T023
- [ ] T025 [P] [US3] Playwright `apps/web/e2e/r7-us3-pay.spec.ts`: US3 1–8, S3-a–S3-e, SC-002 (one transaction, balance once), SC-004 (Pay → Save ≤ 3 selections); refusal when linking an already-linked transaction; unlink; void warning (FR-020)
- [ ] T026 [US3] Pay: `/transactions/new?plan=&month=` builds `payDraft` and sends the link with the create; `components/plan/LinkDialog.tsx` (likely first, then search via `search_transactions`); "Looks paid — link?" in `PlanRow.tsx`; `actions.ts` `planSuggestions`, `linkCandidates`. Already-linked search results are shown disabled with "Already pays <item> (<month>) — unlink it first", and `changes.linkTransaction` refuses a transaction whose stored link is set (US3 3, R7-03)
- [ ] T027 [US3] `components/transactions/TransactionForm.tsx` "Pays:" choice (debounced `planSuggestions`, first ticked, others and None) and transaction detail `apps/web/app/(app)/transactions/[id]` "Pays <item> (<month>)" with Unlink; delete/void warnings — passes T025

## Phase 6: User Story 4 — Overdue carry-forward and cash by account (P2)

**Goal**: Unpaid item-months carry forward, counted once, and the user sees per-account cash needed against what is available.

**Independent Test**: An unpaid September rent shows in October as Overdue with its September due date, and Everyday Savings shows still to pay, available and "short by".

- [ ] T028 [P] [US4] Playwright `apps/web/e2e/r7-us4-overdue.spec.ts`: US4 1–4, S4-a, SC-005 (carried once; "counted in <month>" elsewhere; paying it clears every month)
- [ ] T029 [US4] `components/plan/CarriedOver.tsx`, `CashByAccount.tsx` (balances from the R2 accounts summary; card available credit when a limit is set) — passes T028

## Phase 7: User Story 5 — Comparison and people panel (P2)

**Goal**: Last month's totals and per-item paid amounts, and money owed to and by people.

**Independent Test**: The comparison states the difference in words, and the people totals equal the People screen.

- [ ] T030 [P] [US5] Playwright `apps/web/e2e/r7-us5-compare.spec.ts`: US5 1–2, S5-a (difference in words; people totals equal People; a person opens)
- [ ] T031 [US5] `components/plan/Comparison.tsx`, `PeopleOwed.tsx` (people balances from the R6 Dashboard source) — passes T030

## Phase 8: Cross-cutting — safe to spend and month-check nudge (FR-018, FR-023)

**Goal**: Safe to spend subtracts unpaid plan items. A nudge runs from the 25th to the 5th, with "Plan checked", "Not now" and a setting.

**Independent Test**: S6-a, S6-b, S7-a.

- [ ] T032 [P] Core vectors for `planUnpaidForSafeToSpend`, `safeToSpend` with `planUnpaidMinor`, and `nudgeFor`:
  - excluded from the subtraction: card bills, accounts not in net worth, and amounts already
    linked as upcoming (subtracted once);
  - nudge days: the 24th, 25th, the last day of the month, the 1st, 5th and 6th;
  - December to January;
  - the setting off, and a checked month;
  - in `packages/core/test/reports.test.ts` and `plan.test.ts`.
- [ ] T033 Core `packages/core/src/plan/nudge.ts`, `planUnpaidForSafeToSpend` in `month.ts`, `safeToSpend` gains `planUnpaidMinor` in `packages/core/src/reports/index.ts` — passes T032
- [ ] T034 [P] Playwright `apps/web/e2e/r7-nudge.spec.ts` (fixed clock): S6-a, S6-b, SC-008 (window, Not now until tomorrow, Plan checked on the nudge and the plan, setting off); `r6-us1-dashboard.spec.ts` updated for the plan part (S7-a)
- [ ] T035 Wire the nudge and the safe-to-spend part into the UI. Passes T034.
  - `components/plan/PlanNudge.tsx`, on the Dashboard `apps/web/app/(app)/page.tsx` and on the plan
    screen.
  - "Not now" in `localStorage` (`ft.planNudge.snoozedUntil`, wrapped in try/catch).
  - "Plan checked" goes through `PATCH /api/me/preferences`. It is offered only on the nudge's month.
  - Settings switch: "Remind me to check next month's plan".
  - `components/dashboard/SafeToSpendCard.tsx` shows "Still to pay in your plan".

## Phase 9: User Story 6 — Android (P3)

- [ ] T036 [US6] *Deferred* to the Android phase: the plan, Pay and link, the item form, the nudge and the setting on Android, all reusing core `plan/*`

## Phase 10: Polish

- [ ] T037 [P] Accessibility in `apps/web/e2e/a11y.spec.ts`. Covered: the plan month, the item form, the link dialog and the nudge, at 1280 and 390 px, plus a keyboard Pay flow (SC-007).
- [ ] T038 [P] Performance `apps/web/e2e/r7-performance.spec.ts` (E2E_PRODUCTION): 100 items, 24 months of links — plan < 2 s, month change < 1 s (SC-003)
- [ ] T039 Write `specs/007-payment-plan/review-notes.md`. List the explicit-review items from the plan's post-design re-check.
- [ ] T040 Run every suite and write `specs/007-payment-plan/validation.md`, including the manual rows from quickstart.md and the SC-004 timing (a monthly item set up in under 1 minute).
- [ ] T041 Converge: contracts as built, `ROADMAP.md` R7 status, Android task carried to the Android phase

## Dependencies

- Setup (T001–T006) → Foundational (T007–T016) → US1 (MVP) → US2 → US3 → US4 → US5 → Phase 8 → Polish.
- T008 needs T007; T010 needs T009 and T003; T012 needs T010; T014 needs T012; T016 needs T014 and T008.
- US2's estimates use T008. US3 needs US1's screen and T024. US4 and US5 extend the US1 screen. Phase 8 needs `planMonth` (T008) and the Dashboard.
- Migrations run in order: enums → tables → rules → apply → links → pull/reset.

## Parallel Examples

- Setup: T004 and T005 alongside the migrations T001–T003.
- Foundational: write the T007 vectors, T009/T011/T013 pgTAP files and the T015 integration test together, then implement each.
- Per story: the Playwright spec ([P]) is written before the screen work; US4 and US5 specs can be written together.

## Implementation Strategy

1. MVP = Setup + Foundational + US1: the plan is visible with demo data and exact totals.
2. Add US2 (set up), then US3 (pay and link): the spreadsheet is replaced.
3. Add US4, US5, then safe to spend and the nudge.
4. Polish, review notes, validation, converge, then the PR. Android follows in the Android phase.
