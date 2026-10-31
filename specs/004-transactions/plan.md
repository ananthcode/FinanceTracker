# Implementation Plan: Transactions

**Branch**: `004-transactions` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-transactions/spec.md`

## Summary

Record expenses, income, refunds, transfers and person movements (with splits, tags, notes,
reference, status), keep account and person balances, net worth and spending/income totals exact
from them, handle upcoming transactions and month-end interest through one "To confirm" step, and
let the user search, filter, bulk-edit and relocate. A transaction is one synced row on R2's engine
(split lines and tags inside it, amount and lines versioned together); every money effect is derived
into server-side postings by a trigger and mirrored by one pure function in core, proven equal on
shared vectors. Decisions: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x strict on Node.js 24 LTS; SQL (PostgreSQL 15+, Supabase)

**Primary Dependencies**: As R3. **No new dependencies.**

**Storage**: new synced tables `transactions`, `person_rates`; derived `private.transaction_postings`;
`payees.interest_mode`; enums per data-model.md.

**Testing**: Vitest (core vectors, integration incl. parity), pgTAP, Playwright (+ axe); production
performance test gated by `E2E_PRODUCTION`.

**Target Platform**: Web on Vercel Hobby; Android in the Android phase; Supabase Free.

**Project Type**: Monorepo (R1 layout).

**Performance Goals**: list opens < 2 s and search/filter < 1 s with 20,000 transactions (SC-003);
expense or transfer recorded < 20 s (SC-001).

**Constraints**: free tiers; `bigint` paise and decimal strings; single write path plus two narrowly
scoped RPCs (`propose_interest`, `search_transactions`); no financial data in logs.

**Scale/Scope**: up to ~50,000 transactions per user; 3 web routes + 3 extended; 1 new API route;
2 synced tables + 1 derived; 8 stories (7 on web now).

## Constitution Check

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Isolation | PASS | RLS select-own on new tables; postings not client-readable; every referenced id checked to be the caller's; access rules tested |
| II | Money | PASS | `bigint` paise; amounts never rounded; interest rounding documented (half away from zero) and tested; balances derived from postings, recomputable, TS/SQL parity |
| III | Audit | PASS | Audit trigger on transactions and rates; confirm, relocate and merges recorded; soft delete; erasure |
| IV | Offline-first | PASS (phased) | Entities on R2's engine; amount+lines versioned together; Android client deferred by owner decision |
| V | No real data | PASS | Synthetic demo transactions only |
| VI | Secrets | PASS | No new secrets |
| VII | Shared core | PASS | Postings, movements, totals, interest, labels, schemas in core |
| VIII | Validation | PASS | Zod per entity/kind; `apply_changes` re-validates; DB checks and composite FKs |
| IX | Testing | PASS | Vectors incl. edge amounts, compounding, flips; pgTAP isolation; sync duplicates/conflicts |
| X | Demo-first | PASS | 24-month deterministic demo transactions |
| XI | Simplicity | PASS w/ notes | Complexity Tracking below |
| XII | India-first | PASS | Calendar dates in the user's timezone; optional time only for ordering; lakh/crore display |
| XIII | Accessible UX | PASS | Directions in words; keyboard split editor and bulk selection; `<Money>` everywhere |
| Flow | Gates | PASS | Clarify answered 2026-10-31; sync/RLS/money code listed for explicit review |

**Post-design re-check**: PASS. Explicit review at the PR: transaction applier validation and
scoping, postings trigger and balance functions, interest proposal function, relocate and extended
merges, search function (INVOKER), activity functions.

## Project Structure

```text
specs/004-transactions/   plan, research, data-model, quickstart, contracts/, checklists/, tasks
packages/core/src/
├── transactions/   schemas.ts, postings.ts, totals.ts, labels.ts
├── interest/       amount.ts, propose.ts
└── demo/transactions.ts
packages/db/src/repositories/transactions.ts
supabase/migrations/2026110[1-…]_*   enums, transactions + rates + postings, rules (balances,
                                     activity), apply (transactions, rates, relocate, merges),
                                     interest, search, pull, erasure
supabase/tests/tx_*.test.sql
apps/web/
├── app/(app)/transactions/   page, new, [id]; server actions for Load more
├── app/api/interest/propose/route.ts
├── components/transactions/  TransactionForm, SplitEditor, PayeeCombobox, TagPicker, TransactionList,
│                             FilterPanel, BulkBar, ToConfirm, TransactionRow
└── e2e/r4-*.spec.ts
```

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| Derived postings table maintained by trigger | One place derives every money effect for balances, totals, filters and activity (FR-007–FR-009, FR-021) | Reading jsonb lines at query time duplicates logic and is slow to filter |
| `amount` + `lines` in one field version | Splits must always add up after offline edits (FR-012, FR-023) | Separate versions can merge into an inconsistent split |
| `propose_interest` RPC with advisory lock | Exactly once per person per month across devices (SC-007), order-independent compounding | A cron job has no user scope; client-only proposals duplicate |
| `search_transactions` RPC | Combined filters with keyset paging and totals in one round trip (SC-003) | PostgREST filters cannot express category roll-up and text over joined names |
