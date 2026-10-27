# Implementation Plan: Categories, Tags & Payees

**Branch**: `003-categories-tags-payees` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-categories-tags-payees/spec.md`

## Summary

Add nested expense and income categories (with a one-time "suggested / empty" start choice for the
Indian default tree), free-form tags, and payees that are businesses or people. People carry an
exact opening balance with a direction, appear on a new **People** screen in the main navigation
with two totals, and can be switched into net worth on the accounts summary. Hide, merge and delete
keep lists clean; relocate moves to R4 (owner, 2026-10-27).

No new transport: the three record types join R2's sync engine as new entities (research R3-01).
New on the server: tree rules (same-kind parent, no cycles, sibling-unique names), a server-side
**merge** change kind that repoints references atomically (R3-05), and `app.start_categories` for
the start choice (R3-06). Balances stay derived; the person balance has a TS function and an SQL
twin proven equal by shared vectors (R3-07). Decisions: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x strict on Node.js 24 LTS; SQL (PostgreSQL 15+, Supabase)

**Primary Dependencies**: As R2 (Next.js 16, React 19, Tailwind 4 + shadcn/ui, supabase-js 2,
Zod 4, lucide-react, dnd-kit). **No new dependencies.**

**Storage**: Supabase Postgres — new synced tables `categories`, `tags`, `payees`; enums
`category_kind`, `payee_kind`, `categories_start`; `user_preferences.categories_start`; new audit
actions. On Android (later): the R2 local store gains the three tables.

**Testing**: Vitest (core vectors and helpers, db repositories, `*.int.test.ts` API integration incl.
TS/SQL parity); pgTAP for access rules, constraints, cycles, merges and the start choice; Playwright
for stories 1–5 incl. axe and keyboard use; production-build performance test gated by
`E2E_PRODUCTION`.

**Target Platform**: Web on Vercel Hobby; Android 10+ in the Android phase; Supabase Free.

**Project Type**: Monorepo — web app + Android app + shared packages + database (R1 layout).

**Performance Goals**: With 500 categories and 2,000 payees, Categories and Payees open within 2 s
and picker/search matches show within 1 s (SC-002); sub-category or payee added in < 30 s (SC-001).

**Constraints**: Free tiers; money as `bigint` paise and decimal strings; single write path
(`apply_changes`) plus one narrowly scoped RPC (`start_categories`); no names, notes or balances in
logs; web online-only.

**Scale/Scope**: ≤ 500 categories, ≤ 500 tags, ≤ 2,000 payees per user, < 20 users; 7 web routes
+ navigation entry; 1 new API route, 2 extended; 3 tables; 1 new RPC, 2 extended; 6 stories (5 on
web now).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Per-user isolation | PASS | RLS select-own (+ active user) on all three tables; no client write grants; `apply_changes` and `start_categories` scope to `auth.uid()`; composite FKs keep parents and default categories within the owner; access rules 1–8 tested |
| II | Money correctness | PASS | Person opening balances `bigint` paise, decimal strings on the wire, parsed by R2's `parseAmountInput`; balances derived, never stored; merge adds balances exactly; TS and SQL share vectors |
| III | Auditable records | PASS | Audit trigger on every insert/update of categories, tags, payees (constitution names all three); merges record source, target and every moved row; soft delete with `merged_into`; erasure deletes the history |
| IV | Offline-first mobile | PASS (phased) | Entities use R2's engine (client UUIDs, idempotent changes, per-field rule, suffix on clashes, server-checked merges); Android client in the Android phase by owner decision 2026-10-24 |
| V | No real data in repo | PASS | Synthetic names and amounts; demo people use invented names |
| VI | Secrets & environments | PASS | No new secrets; RPCs run with the user's token |
| VII | Shared core, thin clients | PASS | Tree, paths, search, move/merge rules, defaults, person balances, People totals and net-worth inclusion in `packages/core`; apps render only |
| VIII | Validate at boundaries | PASS | Zod schemas per entity and kind; `apply_changes` and `start_categories` re-validate; DB checks, enums, composite FKs, partial unique indexes |
| IX | Testing discipline | PASS | Core edge cases (zero, both directions, maximum, merged people); pgTAP isolation incl. owner-admin; sync tests for duplicates, replayed merges, offline name clashes |
| X | Demo-first | PASS | `packages/core/src/demo/lists.ts` adds categories, tags, businesses and people to the deterministic demo set (R3-15); R5 loads it |
| XI | Simplicity & free tier | PASS | No new dependency or service; complexity listed below |
| XII | India-first locale | PASS | Indian default categories; lakh/crore via `formatMoney`; opening date is a calendar date in the user's timezone |
| XIII | Accessible, graphical UX | PASS | Direction words on every balance; keyboard tree navigation and Move dialog; picker is a labelled combobox; `<Money>` masks under hide-balances |
| Tech | Technology constraints | PASS | R2 sync engine reused (no replacement); SQL migrations only |
| Flow | Workflow & gates | PASS | Clarify answered by the owner 2026-10-27 (incl. the relocate → R4 roadmap change); sync, RLS, merge and money code flagged for explicit review |

**Post-design re-check (after Phase 1)**: PASS — the data model and contracts add no violations.
Items for explicit owner review at the PR: `apply_changes` extensions (scoping, cycle check, merge
repointing), `start_categories` (SECURITY DEFINER, lock, first-wins), RLS and grants on the three
tables, `person_balance_minor` and `summarise` people inclusion, the erasure extension, and the
merge repoint registry R4 must extend.

## Project Structure

### Documentation (this feature)

```text
specs/003-categories-tags-payees/
├── plan.md              # This file
├── research.md          # Phase 0 decisions R3-01 … R3-16
├── data-model.md        # Tables, enums, reference map, transitions
├── quickstart.md        # Run & validation guide
├── contracts/
│   ├── sync-protocol.md # New entities, merge kind, codes, pull rows
│   ├── http-api.md      # /api/categories/start; push/pull and /api/me extensions
│   ├── database.md      # apply_changes extensions, start_categories, access rules to prove
│   └── client-lists.md  # Navigation, routes, screen rules, shared primitives
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/core/src/
├── categories/          # defaults.ts (DEFAULT_CATEGORIES), tree.ts, search.ts, rules.ts, schemas.ts
├── tags/schemas.ts
├── payees/schemas.ts
├── people/              # balance.ts, totals.ts, labels.ts
├── accounts/summary.ts  # extended: people inclusion (R3-08)
├── accounts/appearance.ts → appearance/icons.ts  # APPEARANCE_ICON_KEYS (R3-09)
├── sync/schemas.ts      # new entities, merge kind, codes, pull rows
└── demo/lists.ts        # deterministic demo lists (R3-15)
packages/core/test/vectors/  # people.json (+ balances.json people cases)
packages/db/src/repositories/
├── lists.ts             # listCategories, listTags, listPayees
└── sync.ts              # pull rows for new entities; startCategories
supabase/
├── migrations/2026102[7-9]_*  # enums+audit actions, categories, tags, payees, preference,
│                              # appliers + merges, start_categories, pull, erasure, person balance
└── tests/               # lists_rls.test.sql, lists_apply.test.sql, lists_merge.test.sql,
                         # lists_audit.test.sql
apps/web/
├── components/shell/nav-items.ts   # + People
├── app/(app)/people/               # page, new, [id]
├── app/(app)/settings/{categories,payees,tags}/
├── app/api/categories/start/route.ts (+ int test)
├── components/lists/               # CategoryTree, CategoryPicker, CategoryForm, MoveDialog,
│                                   # MergeDialog, PayeeList, PayeeForm, PersonRow, PeopleTotals, TagList
├── components/accounts/NetWorthSummary.tsx  # People line
└── e2e/r3-*.spec.ts
```

**Structure Decision**: Unchanged layout. New domain folders in `packages/core` per record type;
the three tables share one set of migrations and pgTAP files ("lists"). The web places People in
the app's main navigation and the three management screens under Settings.

## Complexity Tracking

> Additions beyond the simplest design, justified per Principle XI.

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| Server-side `merge` change kind with recursive category merge | FR-023/FR-024 need every reference moved atomically, including records a device has not pulled; Android merges must be replay-safe (FR-033) | Client-side merge as many updates is not atomic and cannot see unpulled records |
| Separate `start_categories` RPC outside `apply_changes` | First-answer-wins and "never twice" (SC-008) need a lock plus a check across the whole table in one transaction | Seeding via ~70 pushed creates races between devices; deterministic ids collide with deleted defaults |
| Composite foreign keys including `kind` | The database itself guarantees same-user, same-kind parents (Principles I, VIII) | A check in `apply_changes` alone could be bypassed by a future code path |
| Person balance in both TS and SQL | Server enforces "person → business only at ₹0.00"; clients compute totals | Same reason as R2's balance pair; shared vectors keep them equal |
