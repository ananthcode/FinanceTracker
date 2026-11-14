# Implementation Plan: Data Export

**Branch**: `010-data-export` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-data-export/spec.md`

## Summary

The user's own data out and back in:
- **Backup (JSON)**: complete and versioned; optionally locked with a password; optionally zipped with the
  receipt files. Imported only into empty data (or reset and import), all or nothing, with a report.
- **Excel and CSV**: one table per record type, names not ids, a date range for transactions, safe to open.
- **History, not contents**: exports and imports are recorded as events; no contents in logs.

**How it is built**: the browser reads everything through the existing sync pull and builds the files with
core (R10-01, R10-03); core owns the backup schema, the reader, the lock (Web Crypto) and the change builder
(R10-02, R10-04); an import is a short server session of chunks applied through the same change appliers as a
push, undone by the R5 reset if anything is refused (R10-05). Decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x strict on Node.js 24 LTS; SQL (PostgreSQL 15+, Supabase)

**Primary Dependencies**: As R9. **No new packages**: CSV, XLSX and ZIP are written by core; encryption is
Web Crypto; zip deflate reading uses the browser's `DecompressionStream`.

**Storage**: `private.imports` (import sessions); no new synced table.

**Testing**: Vitest (core vectors, round trips), pgTAP, integration (export → reset → import parity), Playwright.

**Target Platform**: Web on Vercel Hobby (4.5 MB request/response limit, 8 s statement limit for user
requests); Android in the Android phase.

**Constraints**: exact paise everywhere (constitution II); the single write path for records; nothing about
the data in logs; no server-side copy of an export.

**Scale/Scope**: 20,000 transactions — export ≤ 30 s, import ≤ 2 min (measured ≈ 4 ms a record through the
appliers); Settings › Your data extended; 2 HTTP routes; 5 database functions.

## Constitution Check

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Isolation | PASS | Export reads only through the RLS pull; import sessions belong to the caller; imported records become the caller's (fresh ids) |
| II | Money | PASS | Paise as decimal strings in backups; rupees formatted from bigint in tables; no float arithmetic |
| III | Audit | PASS | `data_exported`, `data_imported`, `data_import_undone`; imported records get normal history |
| IV | Offline-first | PASS (phased) | Export works from synced data; Android in its phase |
| V | No real data | PASS | Tests use the synthetic demo household and generated files |
| VI | Secrets | PASS | Backup passwords never leave the device; no keys involved |
| VII | Shared core | PASS | Formats, reader, lock, change builder and tables in core |
| VIII | Validation | PASS | The whole file checked by core before import; every change re-checked by the appliers |
| IX | Testing | PASS | Round-trip parity (SC-001), bad-file set (SC-004), isolation (SC-005) |
| X | Demo-first | PASS | Demo household exported and restored in tests |
| XI | Simplicity | PASS | No new packages; reuses pull, push appliers, reset, R9 uploads |
| XII | India-first | PASS | Indian number grouping in Excel; financial-year ranges |
| XIII | Accessible UX | PASS | Labelled controls, progress in a status region, report in words |
| Flow | Gates | PASS | Clarify answered 2026-11-14 (Q1–Q3); import path and lock listed for review |

**Post-design re-check**: PASS. Explicit review at the PR: the import session functions (only into empty
data, only the caller's session, interest marks only on the session's rows, abort = reset); that every
imported record goes through `_apply_one`; the lock parameters; formula safety; the export log carries no
contents.

## Project Structure

```text
packages/core/src/export/   backup.ts (schema, from pull, reader), lock.ts, changes.ts (backup → changes),
                            tables.ts, csv.ts, xlsx.ts, zip.ts, names.ts, index.ts
supabase/migrations/20261116000001_exp_*.sql   enums, imports table and functions
supabase/tests/exp_*.test.sql
apps/web/
├── app/api/me/import/route.ts, app/api/me/export-log/route.ts
├── components/settings/ExportData.tsx, ImportBackup.tsx
├── lib/export-client.ts (pull pages, files, download), lib/import-client.ts (chunks, uploads, abort)
└── e2e/r10-*.spec.ts
```

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| Import sessions with chunks and undo-by-reset | All-or-nothing import of 20,000 records under the 4.5 MB request and 8 s statement limits | One request does not fit; set-based inserts would bypass the appliers' rules |
| Own XLSX/ZIP writer in core | Excel export without a stale or heavy package | SheetJS's npm build is old; exceljs is large and Node-oriented |
| Interest marks at `finish` | A restored interest proposal must stay a proposal, or the R4 proposer duplicates it | Restoring proposals as manual entries makes the next proposal run add them again |
