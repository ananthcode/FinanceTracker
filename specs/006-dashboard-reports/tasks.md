---

description: "Task list for R6 — Dashboard, drill-down reports & person statements"
---

# Tasks: Dashboard, Drill-down Reports & Person Statements

**Input**: Design documents from `/specs/006-dashboard-reports/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (database.md,
client-reports.md), quickstart.md

**Tests**: Included (constitution IX; SC-001, SC-002, SC-003, SC-005, SC-006). Tests first.

**Organization**: by user story. Stories 1–4 on the web now; Story 5 (Android) deferred.

## Format: `[ID] [P?] [Story] Description`

Migration names `YYYYMMDDHHMMSS_*` (`<ts>`), in the listed order.

---

## Phase 1: Setup

- [X] T001 [P] Migration `<ts>_rpt_fields.sql`: enum `statement_sign`; `payees.statement_sign`; `user_preferences.buffer_minor`; `_apply_payee` accepts `statementSign`; preferences update path accepts `buffer_minor`
- [X] T002 [P] Core: `PayeeView.statementSign`, payee schemas, `PreferencesSchema.bufferMinor`, demo lists (Ravi: they owe positive, Meera: I owe positive); lists repository, pull, mobile `payeeFromRow` and mobile/web preferences forms carry or omit the new fields (R3/R4 lessons)
- [X] T003 `pnpm db:types`

## Phase 2: Foundational

- [ ] T004 [P] Vectors `packages/core/test/vectors/reports.json` (nested categories, refunds above spending, splits with person shares, Uncategorised, no payee, void/unconfirmed/deleted left out, months) and `packages/core/test/reports.test.ts`
- [ ] T005 `packages/core/src/reports/` (`periods.ts` presets incl. Apr–Mar; `tree.ts` `categoryTree` from total rows; `trend.ts`; `safe.ts` `safeToSpend`) — passes T004
- [ ] T006 [P] pgTAP `rpt_readers.test.sql`: own data only; counting rules; range checks; `categoryExact` and `payeeId: none` search filters; `statementSign` applied
- [ ] T007 Migration `<ts>_rpt_readers.sql`: `app.category_payee_totals`, `app.month_totals`; search filters — passes T006
- [ ] T008 [P] Integration `apps/web/lib/reports-parity.int.test.ts`: reports vectors through the readers equal core; the payee-level search count/total equal the tree's
- [ ] T009 `packages/db/src/repositories/reports.ts` (`categoryPayeeTotals`, `monthTotals`) — passes T008

## Phase 3: User Story 1 — Dashboard (P1) 🎯 MVP

- [ ] T010 [P] [US1] Playwright `apps/web/e2e/r6-us1-dashboard.spec.ts`: US1 1–5, S1-a, S1-b (figures equal Accounts/People/Transactions; buffer changes safe to spend)
- [ ] T011 [US1] `apps/web/app/(app)/page.tsx` Dashboard and `components/reports/SafeToSpend.tsx` (parts listed, "Change buffer"); buffer in Settings preferences; empty state — passes T010

## Phase 4: User Story 2 — Drill-down (P1)

- [ ] T012 [P] [US2] Playwright `apps/web/e2e/r6-us2-drilldown.spec.ts`: US2 1–7, S2-a, SC-004 (≤ 4 selections)
- [ ] T013 [US2] `/reports` with `PeriodPicker`, `Breadcrumb`, `BarList` (+ "Show as table"), payee level → R4 transaction rows; "Reports" in the navigation (`us5-shell` updated) — passes T012

## Phase 5: User Story 3 — Trend (P2)

- [ ] T014 [P] [US3] Playwright `apps/web/e2e/r6-us3-trend.spec.ts`: US3 1–3, S3-a
- [ ] T015 [US3] `TrendChart` (grouped bars + table) on `/reports?view=trend` — passes T014

## Phase 6: User Story 4 — Person statements (P1)

- [ ] T016 [P] [US4] Vectors `packages/core/test/vectors/statements.json` (opening before range, flips, interest, split shares, empty range, sign setting) and `packages/core/test/statements.test.ts`; `packages/core/test/pdf.test.ts` (writer output parses: header, objects, xref offsets, page count)
- [ ] T017 [US4] `packages/core/src/statements/statement.ts`, `pdf.ts` — passes T016
- [ ] T018 [P] [US4] Playwright `apps/web/e2e/r6-us4-statement.spec.ts`: US4 1–5, S4-a, SC-005 (PNG and PDF downloads; notes only when switched on)
- [ ] T019 [US4] `/people/[id]/statement` (`StatementView`, sign setting, "Include notes", `StatementDownload` drawing pages on canvas → PNG / PDF); "Statement" link on the person page — passes T018

## Phase 7: User Story 5 — Android (P3)

- [ ] T020 [US5] *Deferred* Android dashboard, reports and statements with the share sheet

## Phase 8: Polish

- [ ] T021 [P] Accessibility: `a11y.spec.ts` covers `/`, `/reports` (each view, table toggle, keyboard), the statement (1280/390 px)
- [ ] T022 [P] Performance `apps/web/e2e/r6-performance.spec.ts` (E2E_PRODUCTION): 20,000 transactions — Dashboard < 2 s, drill step / period < 1 s (SC-003)
- [ ] T023 [P] Hide-balances list gains `/`, `/reports`, the statement (SC-006 of R1)
- [ ] T024 Write `specs/006-dashboard-reports/review-notes.md`
- [ ] T025 Run every suite; write `specs/006-dashboard-reports/validation.md`
- [ ] T026 Converge: contracts as built, ROADMAP status, Android task carried to the Android phase

## Dependencies

Setup → Foundational → US1 (MVP) → US2 → US3 → US4 → Polish. US3 reuses US2's drill-down.
