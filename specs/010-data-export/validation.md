# Validation: Data Export (R10)

Run on 2026-11-14/15 against the local Supabase stack, on branch `010-data-export`. Environment: Windows 11,
Chromium, `next dev`. All data is synthetic (`@example.com` users, the generated demo household, seeded
transactions). Steps are in [quickstart.md](quickstart.md).

## Automated suites

| Suite | Command | Result |
|-------|---------|--------|
| Core unit (Vitest) | `pnpm test` | `@ft/core` 369 passed. R10 adds `export-files` (5: zip round trip and damage, CRC-32, CSV quoting / BOM / formula safety, XLSX parts, dates and amounts), `export-backup` (7: live rows only, declined proposals, reader problems, lock and wrong password, fresh ids and order, same records as the demo load, broken references and rules, interest marks and dropped plan links), `export-tables` (3: tables by type with names, date ranges, file names). |
| Web / DB / Mobile unit | `pnpm test` | `@ft/web` 23, `@ft/db` 5, `@ft/mobile` 47 passed |
| Database (pgTAP) | `pnpm db:test` | 40 files, 657 tests, PASS. R10: `exp_import` 17 (empty data only, another user's session, chunks through the appliers, a refusal undoes its chunk, interest marks only on interest rows, declined markers, closed sessions, abort resets, history events). |
| Integration | `pnpm --filter @ft/web test:int` | 19 files, 91 passed. R10: `export-import` (3): export → reset and import gives back identical account balances, person balances, month totals, templates, plan and interest proposals (SC-001); history events carry counts, no contents; a refused part undoes the import and another user cannot use the session; a locked backup round trip. |
| End-to-end (Playwright) | `pnpm exec playwright test` (R1–R10) | 137 tests: **126 passed, 6 skipped** (production-only performance checks), 5 failed in the full run — all with the machine asleep (`ERR_NETWORK_IO_SUSPENDED`; the run took 5.5 h) — and **all 5 passed on re-run** (1.3 min). |
| Typecheck / Lint | `pnpm typecheck`, `pnpm lint` | PASS, no warnings |
| Performance (SC-002) | `r10-performance` with `E2E_PRODUCTION=1`, run against the **dev** server | 20,000 transactions: **export 19.4 s** (< 30 s), **import 59.6 s** (< 2 min). Not yet measured on a production build. |

**Found by the runs:**
- The export and import panels first sat inside the "Your data" region and confused its existing status
  checks; they are now their own Settings section, "Export and import".
- The R4 seeder (which writes straight into the database) makes transactions dated before their account
  opened; the import refused them (`DATE_BEFORE_OPENING`) — the checks work. The R10 performance spec seeds
  dates after the accounts opened.

## Quickstart rows → evidence

| Row | Covered by | Result |
|-----|-----------|--------|
| S1-a | `r10-us1-backup`: "Finance Tracker backup <date>.json" with format and version; > 250 transactions | PASS |
| S1-b / SC-001 | `r10-us1-backup`: reset, import, the report counts, Accounts identical; integration parity on balances, people, month totals, plan, templates, proposals | PASS |
| S1-c | `r10-us1-backup`: into data that is not empty only "Reset and import" is offered; integration: `begin` refused with `NOT_EMPTY` | PASS |
| S1-d / SC-004 | `r10-us1-backup`: a foreign file → "This file is not a backup of this app."; core reader and problem vectors; pgTAP and integration: a refused record undoes everything | PASS |
| S1-e | `r10-us1-backup`: locked export has no readable names; wrong password refused; right one restores via Reset and import with RESET | PASS |
| S2-a | `r10-us2-spreadsheets`: one .xlsx with the expected sheets and names | PASS |
| S2-b / SC-003 | `r10-us2-spreadsheets`: CSV for last month has only last month's transactions; its count and net equal the Transactions list for the same dates | PASS |
| S3-a | `r10-us3-receipts`: a backup with attachments is a zip; after a reset, importing it puts the demo receipt back on the refrigerator and it opens | PASS |
| US3 (CSV with files) | `r10-us3-receipts`: the file is in the zip and named in attachments.csv | PASS |
| SC-005 | Exports read only through the RLS pull; integration checks the history has counts, no contents; routes log no bodies (R1 handler test) | PASS |
| SC-006 | `a11y` "R10 …": both panels at 1280 and 390 px, the password fields, unlock, the Reset and import dialog, keyboard only | PASS |

## Not covered here

- Android (US4) — the Android phase.
- SC-002 on a production build.
