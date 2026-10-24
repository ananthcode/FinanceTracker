# Implementation Plan: Accounts & Balances

**Branch**: `002-accounts-balances` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-accounts-balances/spec.md`

## Summary

Add the user's accounts (bank, cash, wallet, credit card) with exact opening balances, a
net-worth summary (Owned / Owed / Net worth with per-group subtotals), personalisation (colour,
icon, one user-wide order, a "By type" view and a "My groups" view), and archive / restore /
delete rules (archive only at ₹0.00; delete only without activity). Balances are never stored —
they are computed in `packages/core` (and mirrored in one SQL function for server checks).

R2 also **chooses the offline sync engine** the constitution assigns to this module: an
in-house change-log protocol (per-field latest-edit-wins with hybrid logical clocks, idempotent
change ids, a per-user ordered pull cursor) implemented as two Postgres functions behind two API
routes. The web uses the same push path for its writes now; the Android local store
(expo-sqlite + outbox) is built in the Android phase on this server side, per the owner's
web-first decision (2026-10-24). Decisions and sources: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x strict on Node.js 24 LTS; SQL (PostgreSQL 15+, Supabase)

**Primary Dependencies**: As R1 (Next.js 16, React 19, Tailwind 4 + shadcn/ui, supabase-js 2 +
@supabase/ssr, Zod 4, react-hook-form, lucide-react). **New**: `@dnd-kit/core` +
`@dnd-kit/sortable` (web reordering, R2-09). Vendored fractional-indexing algorithm in
`packages/core` (no package). Android phase: `expo-sqlite` (bundled with Expo SDK 57).

**Storage**: Supabase Postgres — new tables `accounts`, `account_groups` (synced),
`private.applied_changes`, sequence `sync.seq`; `user_preferences.accounts_view`. On Android
(later): expo-sqlite mirror + outbox.

**Testing**: Vitest (core vectors, db repositories, web units, `*.int.test.ts` API integration);
pgTAP (`supabase test db`) for access rules, constraints, merge and audit; Playwright for stories
1–4 incl. axe and keyboard reordering; Jest for the Android sync loop (Android phase).

**Target Platform**: Web on Vercel Hobby (now); Android 10+ via EAS (Android phase); Supabase Free.

**Project Type**: Monorepo — web app + Android app + shared packages + database (R1 layout).

**Performance Goals**: Accounts screen with 100 accounts (50 active + 50 archived) shows all
balances and the summary within 2 s (SC-003); first account added in < 1 min (SC-001); offline
changes visible on the web within 1 min of reconnecting (SC-007, Android phase).

**Constraints**: Free tiers only; money as `bigint` paise and decimal strings on the wire; no
direct table writes from clients (single write path); no financial data in logs; web online-only;
the sync protocol must be entity-generic for R3/R4.

**Scale/Scope**: ≤ 200 accounts and ≤ 30 groups per user, < 20 users; 4 web routes; 2 API routes
+ 2 extended; 3 tables + 1 sequence; 2 RPCs; 5 user stories (4 built now on web).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Per-user isolation | PASS | RLS select-own (+ active user) on `accounts`, `account_groups`; no client write grants; `apply_changes` scopes every row to `auth.uid()`; `applied_changes` private; owner-admin sees nothing; access rules 1–8 tested (contracts/database.md) |
| II | Money correctness | PASS | `bigint` paise everywhere; decimal-string money on the wire; `parseAmountInput` converts at the boundary without rounding; balances derived, never cached; TS and SQL balance functions share test vectors |
| III | Auditable records | PASS | `audit.capture_record_change` on every insert/update with before/after per field and device type; soft delete only; overwritten values recoverable; erasure deletes account history per III(a/b) |
| IV | Offline-first mobile | PASS (phased) | Sync engine chosen and its server side built and tested now (client UUIDs, idempotent changes, deterministic per-field rule, history keeps losers); Android local store built in the Android phase by owner decision 2026-10-24; web online-only as allowed |
| V | No real data in repo | PASS | Synthetic names/amounts in spec, fixtures and tests; personal account list stays in `private/` |
| VI | Secrets & environments | PASS | No new secrets; RPCs called with the user's token; service role not used for account data |
| VII | Shared core, thin clients | PASS | Balances, summary, labels, parsing, ordering keys, HLC, merge and schemas in `packages/core`; repositories in `packages/db`; apps render only |
| VIII | Validate at boundaries | PASS | Zod change/pull schemas; `apply_changes` re-validates; DB checks, enums, FKs, partial unique index |
| IX | Testing discipline | PASS | Core edge-case vectors, pgTAP isolation incl. owner, sync integration with duplicate delivery and conflicts, Playwright stories; CI unchanged |
| X | Demo-first | PASS | New record type (accounts): R2 adds its part of the deterministic demo dataset (`packages/core/src/demo/accounts.ts` — every type, label and state); R5's "Load demo data / reset" inserts it (fixed after `/speckit-analyze` C1, 2026-10-24) |
| XI | Simplicity & free tier | PASS w/ notes | No new service; one small UI dependency; in-house sync justified in Complexity Tracking |
| XII | India-first locale | PASS | Lakh/crore display via R1 `formatMoney`; opening date is a calendar date checked in the user's timezone |
| XIII | Accessible, graphical UX | PASS | Labels for owed/in credit/overdrawn/excluded (not colour alone); keyboard reordering; all amounts via `<Money>` (hide-balances) |
| Tech | Technology constraints | PASS | Sync engine selected here as required; SQL migrations only; TS strict; Next.js/Expo/Supabase |
| Flow | Workflow & gates | PASS | Spec approved 2026-10-24; plan gate next; RLS, sync and money code flagged for explicit owner review |

**Post-design re-check (after Phase 1)**: PASS — data model and contracts add no violations.
Items flagged for explicit owner review at implementation (constitution workflow): `apply_changes`
(SECURITY DEFINER scoping), RLS policies and grants, the advisory-lock sequence trigger, the merge
function (TS + SQL), the balance functions, and the erasure extension.

## Project Structure

### Documentation (this feature)

```text
specs/002-accounts-balances/
├── plan.md              # This file
├── research.md          # Phase 0 decisions R2-01 … R2-16
├── data-model.md        # Tables, synced-table conventions, state transitions
├── quickstart.md        # Run & validation guide
├── contracts/
│   ├── sync-protocol.md # Change / result / pull shapes, merge rule, HLC (reused by R3+)
│   ├── http-api.md      # /api/sync/push, /api/sync/pull, /api/me additions
│   ├── database.md      # apply_changes, pull_changes, triggers, access rules to prove
│   └── client-accounts.md # Screens, rules, shared primitives
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/core/src/
├── accounts/            # balance.ts, summary.ts, labels.ts, appearance.ts, schemas.ts
├── money/parse.ts       # parseAmountInput (R2-11)
├── ordering/keys.ts     # fractional index keys (R2-06)
├── sync/                # hlc.ts, merge.ts, schemas.ts (Change, ChangeResult, PullResponse)
└── demo/accounts.ts     # deterministic demo account set (constitution X), loaded by R5
packages/core/test/vectors/  # balances.json, merge.json — shared with pgTAP
packages/db/src/repositories/
├── accounts.ts          # listAccounts, listGroups (RLS client)
└── sync.ts              # pushChanges, pullChanges (RPC wrappers)

supabase/
├── migrations/2026102x_*  # enums, sync schema+sequence+stamp trigger, accounts, account_groups,
│                          # applied_changes, audit capture, apply_changes, pull_changes,
│                          # accounts_view preference, erasure extension
└── tests/               # accounts_rls.test.sql, accounts_apply.test.sql, accounts_audit.test.sql

apps/web/
├── app/(app)/accounts/  # page.tsx (+ new, [id], groups) and client components
├── app/api/sync/push/route.ts, app/api/sync/pull/route.ts (+ *.int.test.ts)
├── components/accounts/ # AccountRow, GroupSection, NetWorthSummary, AccountForm, ViewSwitch,
│                        # SortableList (dnd-kit), AccountIcon (key → lucide)
├── lib/sync-client.ts   # browser HLC + device id + push helper
└── e2e/r2-accounts*.spec.ts

apps/mobile/ (Android phase)
└── src/lib/sync/        # sqlite store, outbox, sync loop; src/app/(tabs)/accounts…
```

**Structure Decision**: Unchanged R1 monorepo layout. Domain rules go to `packages/core`, data
access to `packages/db`, schema/rules/tests to `supabase/`, screens to `apps/web` now and
`apps/mobile` in the Android phase. The new `sync` modules in core and the database are generic
so R3 (categories, payees) and R4 (transactions) register entities instead of building transport.

## Complexity Tracking

> Additions beyond the simplest design, justified per Principle XI.

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| In-house change-log sync (HLC, per-field versions, applied-change ledger) | Constitution IV + clarified per-field conflict rule (FR-030, FR-031) | PowerSync: free plan deactivates after 1 idle week, Pro is paid, and writes/conflicts are still ours; WatermelonDB: record-level rule, aging Expo support; plain REST updates: no offline idempotency or deterministic merge |
| Per-user advisory lock in the row-stamp trigger | Pull cursor must never skip rows (FR-031, SC-007) | `updated_at` / plain sequence cursors can skip rows committed out of order |
| Single SECURITY DEFINER write function instead of table grants | Merge, state and limit rules cannot be bypassed by direct REST writes (Principles I, VIII) | Grants + RLS + triggers would let clients write fields without HLC checks |
| `@dnd-kit` dependency | FR-010 requires accessible drag and drop | Native HTML drag-and-drop is not keyboard accessible |
| Balance rule in both TS and SQL | Server must enforce archive-at-zero (FR-022) while clients compute totals | Server-only would need a round trip for every summary; client-only cannot enforce rules — shared vectors keep them equal |
