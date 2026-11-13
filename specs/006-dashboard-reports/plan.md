# Implementation Plan: Dashboard, Drill-down Reports & Person Statements

**Branch**: `006-dashboard-reports` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-dashboard-reports/spec.md`

## Summary

Replace the R1 Dashboard placeholder with net worth, this month's income and spending, safe to spend
(held − card owed − this month's not-yet-confirmed outgoings − buffer), To confirm and people totals;
add a Reports screen with spending/income by category drilling category → sub-category → payee →
transactions, and an income-vs-spending trend; add a person statement for any range with a per-person
sign, downloadable as PNG or PDF. Totals come from R4's postings through two narrow database readers;
the report tree, safe to spend and statements are pure functions in core (tested on vectors, reusable
by Android). Charts, the PNG and the PDF are made in the browser with no new dependency.
Decisions: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x strict on Node.js 24 LTS; SQL (PostgreSQL 15+, Supabase)

**Primary Dependencies**: As R5. **No new dependencies** (charts are SVG/HTML; PNG via canvas; PDF via
a small writer that embeds page images).

**Storage**: `user_preferences.buffer_minor` (bigint ≥ 0, default 0); `payees.statement_sign`
(`they_owe_positive` | `i_owe_positive`, synced). No new tables.

**Testing**: Vitest (core vectors for report tree, safe to spend, statements; PDF writer structure),
integration (readers through the user's client; parity with core), pgTAP (readers own-data only,
counting rules), Playwright (+ axe), production performance test (E2E_PRODUCTION).

**Target Platform**: Web on Vercel Hobby; Android in the Android phase; Supabase Free.

**Project Type**: Monorepo (R1 layout).

**Performance Goals**: Dashboard < 2 s, drill step / period change < 1 s with 20,000 transactions
(SC-003); statement files < 5 s (SC-005).

**Constraints**: free tiers; `bigint` paise; no financial data in logs; downloaded files made in the
browser (nothing uploaded).

**Scale/Scope**: 2 routes (`/`, `/reports`), statement on `/people/[id]/statement`; 2 database readers;
2 new fields; 5 stories (4 on web now).

## Constitution Check

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Isolation | PASS | Readers are SECURITY DEFINER for `auth.uid()` only (postings are private); tests prove own data only |
| II | Money | PASS | Sums in `bigint`; parts add up exactly; shares are display-only percentages |
| III | Audit | PASS | The two new fields are audited like their tables' other fields |
| IV | Offline-first | PASS (phased) | `statement_sign` syncs; report logic in core for Android |
| V | No real data | PASS | Demo household and synthetic vectors only |
| VI | Secrets | PASS | No new secrets or services |
| VII | Shared core | PASS | Report tree, trend, safe to spend, statement rows in core |
| VIII | Validation | PASS | Preference and payee field schemas; readers validate dates |
| IX | Testing | PASS | Vectors, parity, isolation, accessibility, performance |
| X | Demo-first | PASS | Demo people get a statement sign; demo data drives every chart |
| XI | Simplicity | PASS | No chart or PDF library (Complexity Tracking) |
| XII | India-first | PASS | Apr–Mar financial year; lakh/crore; calendar dates in the user's timezone |
| XIII | Accessible UX | PASS | Every chart has a table, keyboard and screen-reader access, words not colour |
| Flow | Gates | PASS | Clarify answered 2026-11-01; readers and the payee applier change listed for review |

**Post-design re-check**: PASS. Explicit review at the PR: the two SECURITY DEFINER readers,
`_apply_payee` accepting `statementSign`, the preferences field.

## Project Structure

### Documentation (this feature)

```text
specs/006-dashboard-reports/   plan, research, data-model, quickstart, contracts/, checklists/, tasks
```

### Source Code (repository root)

```text
packages/core/src/reports/       tree.ts (drill-down), trend.ts, safe.ts (safe to spend), periods.ts
packages/core/src/statements/    statement.ts (rows, opening/closing, sign), pdf.ts (minimal PDF writer)
packages/core/test/              report vectors, statement vectors, pdf structure
packages/db/src/repositories/reports.ts
supabase/migrations/2026110300000*_*   fields, readers
apps/web/
├── app/(app)/page.tsx                    Dashboard
├── app/(app)/reports/page.tsx            spending / income drill-down, trend
├── app/(app)/people/[id]/statement/page.tsx
├── components/reports/                   BarList, TrendChart, Breadcrumb, PeriodPicker, SafeToSpend
├── components/statements/                StatementView, StatementDownload (PNG/PDF)
└── e2e/r6-*.spec.ts
```

**Structure Decision**: As R1–R5.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| Hand-built SVG/HTML charts | Accessible by construction (tables, keyboard, words) and no dependency (XI) | Chart libraries need extra work for screen readers and add weight |
| Minimal PDF writer embedding page images | A real PDF file with ₹ and Indian digits exactly as on screen, no dependency | A text PDF needs an embedded Unicode font for ₹; print-to-PDF is not a download |
| Two SECURITY DEFINER readers | Postings are private (R4); one round trip per screen (SC-003) | Reading transactions on the client duplicates R4's rules and is slow at 20,000 |
