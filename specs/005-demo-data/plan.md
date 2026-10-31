# Implementation Plan: Demo Data

**Branch**: `005-demo-data` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-demo-data/spec.md`

## Summary

Let a user load the deterministic demo household into empty data, reset (permanently clear) their own
financial data, or do both in one step — web first, from a new "Your data" section in Settings. The
household comes from the existing core generators (R2 accounts, R3 lists, R4 transactions and rates),
turned server-side into ordinary sync changes with fresh ids and applied through R2's single write
path inside one database transaction, so every row is validated, stamped and audited like a user's
own. Reset deletes the user's financial rows and their history in one transaction and records a reset
point, which makes other devices start over on their next pull and refuses changes made before it.
Decisions: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x strict on Node.js 24 LTS; SQL (PostgreSQL 15+, Supabase)

**Primary Dependencies**: As R4. **No new dependencies.**

**Storage**: no new synced tables. New `private.data_resets` (one row per user: when and at which
`server_seq` they last reset); new audit actions `demo_data_loaded`, `data_reset`.

**Testing**: Vitest (core: demo changes builder; integration: route, atomicity, at-most-once,
other-device reset), pgTAP (own data only, all-or-nothing, history), Playwright (+ axe).

**Target Platform**: Web on Vercel Hobby; Android in the Android phase; Supabase Free.

**Project Type**: Monorepo (R1 layout).

**Performance Goals**: load visible < 10 s (SC-001); reset < 10 s with 20,000 transactions (SC-003).

**Constraints**: free tiers; demo environment only for loading (`NEXT_PUBLIC_APP_ENV=demo`, and local
development); no financial data in logs; own data only.

**Scale/Scope**: ~600 demo changes per load (19 months at 31-Oct-2026); 1 API route; 3 database
functions; 1 Settings section; 4 stories (3 on web now).

## Constitution Check

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Isolation | PASS | Every function runs for `auth.uid()` only and deletes or inserts only rows with that `user_id`; tests prove another user is untouched |
| II | Money | PASS | Demo amounts are `bigint` paise from core; balances still derived from postings |
| III | Audit | PASS | Demo records are created through the audited write path; reset is the user's own explicit "erase all my data" (III-a) — removes records and their history, keeps one `data_reset` entry; load leaves one `demo_data_loaded` entry |
| IV | Offline-first | PASS | Reset point makes other devices restart their pull and refuses pre-reset offline changes; Android client in the Android phase |
| V | No real data | PASS | Only the synthetic generators already in the repository |
| VI | Secrets | PASS | No new secrets; the route uses the caller's session |
| VII | Shared core | PASS | Demo generators and the changes builder live in core, reusable by Android |
| VIII | Validation | PASS | Each demo change is validated by the same server rules as a push; route input is a strict schema |
| IX | Testing | PASS | Determinism, all-or-nothing, at-most-once, isolation, reset propagation tested |
| X | Demo-first | PASS | This module is the loader the principle requires |
| XI | Simplicity | PASS | Reuses the write path instead of a bulk insert with its own validation |
| XII | India-first | PASS | Demo is generated for "today" in the user's timezone |
| XIII | Accessible UX | PASS | Typed confirmation, results in words, keyboard and screen-reader friendly |
| Flow | Gates | PASS | Clarify answered 2026-10-31; RLS/sync/erasure code listed for explicit review |

**Post-design re-check**: PASS. Explicit review at the PR: `app.load_demo_data`, `app.reset_my_data`
(hard delete and history removal), the reset point in push and pull.

## Project Structure

### Documentation (this feature)

```text
specs/005-demo-data/   plan, research, data-model, quickstart, contracts/, checklists/, tasks
```

### Source Code (repository root)

```text
packages/core/src/demo/changes.ts        demoChanges(today, hlc): the household as create changes
packages/core/src/sync/                  PullResponse.reset flag; DATA_RESET result code
packages/db/src/repositories/data.ts     loadDemoData, resetMyData, dataSummary
supabase/migrations/2026110200000*_*     data resets, load and reset functions, push/pull reset point
supabase/tests/data_*.test.sql
apps/web/
├── app/api/me/data/route.ts             POST { action: load | reset | reset_and_load, confirm? }
├── components/settings/YourData.tsx     the "Your data" section
└── e2e/r5-*.spec.ts
```

**Structure Decision**: As R1–R4; one route and one Settings section, no new screen.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| `private.data_resets` reset point | Other devices must not keep or re-send pre-reset data (FR-012) | Without it, pull from an old cursor returns nothing and the device keeps stale rows; offline pushes recreate deleted records |
| Load through `_apply_one` in one transaction | All-or-nothing and the same validation and history as a push (FR-004, constitution III, VIII) | A bulk insert needs its own validation and audit; chunked pushes cannot be all-or-nothing |
