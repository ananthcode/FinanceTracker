# Implementation Plan: Monthly Payment Plan

**Branch**: `007-payment-plan` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-payment-plan/spec.md`

## Summary

Replace the R1 Payment plan placeholder with a monthly plan of planned payments:
- **Setting up items:** EMIs, rent, card bills, fees and person repayments, each with frequency and
  dated terms. Edits apply from a chosen month.
- **Each month:** an amount can be set or a month skipped. Varying amounts are estimated.
- **Paying:** Pay pre-fills a transaction, and "Link existing", "Looks paid — link?" and the add form's
  "Pays:" link one. Several transactions can pay one item-month; a transaction pays at most one.
- **The month view:** statuses and exact totals, overdue carry-forward counted once, cash needed per
  account, a last-month comparison and the people panel.
- **Elsewhere:**
  - Safe to spend also subtracts unpaid plan items.
  - A month-check nudge runs from the 25th to the 5th on the Dashboard and the plan screen, with a
    setting to turn it off.
  - The demo household gets a plan.

**How it is built:**
- Two new synced tables: `plan_items` (terms in one versioned jsonb field) and `plan_occurrences`
  (deterministic ids, rows only for changed months).
- Links are two synced fields on transactions.
- Two preferences.
- Every rule is a pure function in core (`planMonth`), reused by Android later.
- No new readers or dependencies.

Decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x strict on Node.js 24 LTS; SQL (PostgreSQL 15+, Supabase)

**Primary Dependencies**: As R6. **No new dependencies.**

**Storage**: new synced tables `plan_items`, `plan_occurrences`; `transactions.plan_item_id`,
`plan_month`; `user_preferences.plan_nudge`, `plan_checked_month`; enums `plan_frequency`,
`plan_target` ([data-model.md](data-model.md)).

**Testing**: Vitest (core plan vectors, `occurrenceId`), pgTAP (RLS, appliers, links, merges, audit,
reset/erasure), integration (sync round trip, SQL/TS id parity, repository vs core), Playwright with
a fixed clock (+ axe), production performance test (`E2E_PRODUCTION`).

**Target Platform**: Web on Vercel Hobby; Android in the Android phase (mobile row mappers learn the new
transaction fields now); Supabase Free.

**Project Type**: Monorepo (R1 layout).

**Performance Goals**: plan screen < 2 s and month change < 1 s with 100 items and 24 months of
history (SC-003); Pay in ≤ 3 selections (SC-004).

**Constraints**:
- Free tiers.
- `bigint` paise and decimal strings.
- The single R2 write path (`apply_changes`) for all plan writes.
- Preferences go through the R1 endpoint.
- No financial data in logs.

**Scale/Scope**:
- Routes: 3 new (`/payment-plan`, `/payment-plan/new`, `/payment-plan/[id]`), 4 extended
  (Dashboard, Settings, transaction new/edit).
- Data: 2 synced tables, plus 2 transaction fields and 2 preference fields.
- Stories: 6 (5 on the web now).

## Constitution Check

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Isolation | PASS | RLS select-own on both tables; composite FKs `(id, user_id)` to accounts, payees, categories, items; appliers check every referenced id is the caller's; pgTAP proves it |
| II | Money | PASS | `bigint` paise; no rounding anywhere (±20 % match compares `100·|a−b| ≤ 20·left` in integers); planned = paid + left − overpaid proven on vectors |
| III | Audit | PASS | Audit triggers and actions for items and occurrences; links audited as transaction edits; soft delete; reset and erasure cover the new tables |
| IV | Offline-first | PASS (phased) | Both entities on R2's engine; terms versioned as one field; deterministic occurrence ids prevent duplicates; Android screens in the Android phase |
| V | No real data | PASS | Demo plan and vectors are synthetic |
| VI | Secrets | PASS | No new secrets or services |
| VII | Shared core | PASS | Applies-in, terms, estimates, statuses, totals, matching, Pay drafts, safe to spend, nudge all in core |
| VIII | Validation | PASS | Zod for both entities, link fields and preferences; appliers re-validate; DB checks and FKs |
| IX | Testing | PASS | Vectors incl. month ends, zero/large amounts, timezone "today"; RLS; sync duplicate creates and conflicts on terms |
| X | Demo-first | PASS | Demo household gets a plan with links and an overdue item (FR-019) |
| XI | Simplicity | PASS w/ notes | Complexity Tracking below |
| XII | India-first | PASS | Months and "today" in the user's timezone; lakh/crore display; dd-MMM-yyyy due dates |
| XIII | Accessible UX | PASS | Statuses and "estimated" in words; table layout; keyboard actions; `<Money>` everywhere |
| Flow | Gates | PASS | Clarify answered 2026-11-13 (Q1–Q5, plus the owner's nudge); sync, RLS and money code listed for review |

**Post-design re-check**: PASS. Explicit review at the PR:
- the two new appliers and the `_apply_transaction` link rules;
- the `occurrenceId` derivation in SQL and TS;
- the RLS and grants on the new tables and preference columns;
- merges repointing items;
- the reset and erasure changes;
- the safe-to-spend change (money).

## Project Structure

### Documentation (this feature)

```text
specs/007-payment-plan/   plan, research, data-model, quickstart, contracts/, checklists/, tasks
```

### Source Code (repository root)

```text
packages/core/src/plan/          schemas.ts, months.ts (appliesIn, termFor, dueDate, editTerms,
                                 occurrenceId), month.ts (plannedFor, planMonth), match.ts
                                 (likelyMatches, paysSuggestions, payDraft), nudge.ts
packages/core/src/reports/       safeToSpend gains planUnpaidMinor
packages/core/src/demo/plan.ts   demo items, occurrences and links
packages/core/test/              plan vectors (test/vectors/plan.json)
packages/db/src/repositories/plan.ts
supabase/migrations/20261113000001_plan_enums.sql … _00000N_*   tables, rules, apply, pull/reset/erasure
supabase/tests/plan_*.test.sql
apps/web/
├── app/(app)/payment-plan/page.tsx, new/page.tsx, [id]/page.tsx, actions.ts
├── components/plan/             PlanMonth, PlanRow, PlanTotals, CarriedOver, CashByAccount,
│                                Comparison, PeopleOwed, ItemForm, LinkDialog, PlanNudge
├── components/transactions/     TransactionForm gains "Pays:"; detail shows the link
├── components/dashboard/        SafeToSpendCard gains the plan part; nudge
└── e2e/r7-*.spec.ts
apps/mobile/src/lib/sync/        transactions.ts (+ plan fields), plan.ts row mappers (no screens yet)
```

**Structure Decision**: As R1–R6.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| `terms` jsonb with one field version | Edits apply from a chosen month while earlier months keep what they showed (FR-008, Q5) | Splitting an item breaks comparisons and links; a terms table adds a sync entity |
| Deterministic occurrence ids | Two offline devices editing one item-month must not create two rows (Principle IV) | Server natural-key merge leaves orphan local rows on devices |
| Links as transaction fields | "At most one item-month per transaction" by construction; delete/void automatically stop counting | A link table needs its own entity, sync and a uniqueness rule anyway |
| Estimate "card owed + already paid" | Keeps a part-paid card bill's plan stable (US3 4) | Plain "owed now" shrinks the plan as it is paid and shows false overpayment |
