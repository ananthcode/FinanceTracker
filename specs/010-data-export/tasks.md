---
description: "Task list for R10 — Data export"
---

# Tasks: Data Export

**Input**: Design documents from `/specs/010-data-export/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/export-import.md, quickstart.md

**Tests**: Included (constitution IX; SC-001, SC-003, SC-004, SC-005, SC-006). Tests come first.

**Organization**: by user story. Stories 1–3 on the web now; Story 4 (Android) deferred.

Migration names are `20261116000NNN_*` (`<ts>`), in the listed order.

---

## Phase 1: Setup

- [ ] T001 Migration `<ts>_exp_enums.sql`: audit actions `data_exported`, `data_imported`, `data_import_undone`
- [ ] T002 [P] Core `packages/core/src/export/zip.ts` (stored writer with CRC-32; reader for stored entries, deflate through a supplied inflater) and `csv.ts` (RFC 4180, BOM, formula safety)
- [ ] T003 [P] Core `packages/core/src/export/xlsx.ts`: workbook of tables (inline strings, numbers, dates as serials with a date style, money with the user's number format — Indian grouping via a conditional custom format), XML-escaped, formula-safe

## Phase 2: Foundational (backup format, changes, import sessions)

- [ ] T004 [P] Core vectors `packages/core/test/export-files.test.ts`: zip round trip (names, bytes, CRC), CSV quoting / BOM / `=1+1` kept as text, XLSX parts present and well-formed (sheet names, shared styles, a date serial, a negative amount)
- [ ] T005 [P] Core vectors `packages/core/test/export-backup.test.ts`: `backupFromPull` (live rows only, no seq/versions/user, interest marks, declined proposals); `readBackup` (not JSON, wrong format, newer version, missing parts); `backupProblems` (dangling account/payee/category/plan reference, split not adding up, bad kind shape); `backupChanges` (every id fresh and remapped, plan month ids recomputed, archive and hidden kept, order lists → rates → plan → templates → transactions → attachments); lock/unlock round trip and a wrong password
- [ ] T006 Core `packages/core/src/export/{backup,lock,changes,names}.ts` — passes T004–T005
- [ ] T007 [P] pgTAP `supabase/tests/exp_import.test.sql`: begin only into empty data and once at a time; chunk applies through `_apply_one` and rolls back on a refusal (index and code); another user's session refused; finish sets interest marks only on this session's transactions and adds declined markers; abort resets; history events
- [ ] T008 Migration `<ts>_exp_import.sql`: `private.imports`, `app.import_begin`, `app.import_chunk`, `app.import_finish`, `app.import_abort`, `app.my_open_import`; `_reset_user_data` closes an open session — passes T007
- [ ] T009 [P] Integration `apps/web/lib/export-import.int.test.ts`: demo → pull → backup → reset → import → identical balances, person balances, month totals, plan months, templates (SC-001); a refused chunk undoes everything; locked round trip; another user cannot use a session
- [ ] T010 `apps/web/app/api/me/import/route.ts`, `apps/web/app/api/me/export-log/route.ts` — passes T009

## Phase 3: User Story 1 — Backup and restore (P1) 🎯 MVP

- [ ] T011 [P] [US1] E2E `apps/web/e2e/r10-us1-backup.spec.ts` (export backup, reset, import, same Accounts and Reports; not-empty refused; reset and import; bad file; locked)
- [ ] T012 [US1] `apps/web/lib/export-client.ts` (pull pages with progress, download a Blob) and `lib/import-client.ts` (read file, unlock, check, begin / chunks / finish / abort)
- [ ] T013 [US1] `components/settings/ExportData.tsx` (Backup) and `ImportBackup.tsx` (file, password, contents, Import / Reset and import, progress, report, unfinished import → Undo) in Settings › Your data

## Phase 4: User Story 2 — Excel and CSV (P1)

- [ ] T014 [P] [US2] Core vectors `packages/core/test/export-tables.test.ts`: tables per record type (names, category paths, split lines numbered, rupees from paise, direction), date ranges (transactions, splits, attachments only), totals equal R6 `monthTotals` for the range
- [ ] T015 [US2] Core `packages/core/src/export/tables.ts` — passes T014
- [ ] T016 [P] [US2] E2E `apps/web/e2e/r10-us2-spreadsheets.spec.ts` (Excel and CSV download; CSV of last month parsed: transaction totals equal Reports › Last month)
- [ ] T017 [US2] Excel / CSV options in `ExportData.tsx` (format, range, file names)

## Phase 5: User Story 3 — Receipts (P2)

- [ ] T018 [P] [US3] E2E `apps/web/e2e/r10-us3-receipts.spec.ts` (backup with attachments → reset → import → the demo receipt is back; CSV zip with files)
- [ ] T019 [US3] Include attachments: fetch files into the zip (size shown first); import uploads them with the R9 links before the last chunk; allowance checked first, "import without the files" offered

## Phase 6: Polish & cross-cutting

- [ ] T020 [P] a11y (`/settings` export and import panels, the import dialog and report)
- [ ] T021 [P] Log check: an integration test that export-log and import routes write no contents (SC-005)
- [ ] T022 `specs/010-data-export/review-notes.md`, `validation.md`; contract as built; ROADMAP R10 (and R9 merged)

## Phase 7: User Story 4 — Android (P3, deferred)

- [ ] T023 [US4] Export / import on Android — deferred to the Android phase

## Dependencies

Phase 1 → Phase 2 → US1 → US2, US3 (US3 needs US1's import) → Polish.
