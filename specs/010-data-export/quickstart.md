# Quickstart: Data Export (R10)

Local stack as for R1–R9. Load the demo household from Settings › Your data (synthetic data only).

## Automated

| Suite | Command | Covers |
|-------|---------|--------|
| Core | `pnpm test` | backup schema and reader (format, version, bad files), lock/unlock (wrong password), backup → changes (remapped references), tables and date ranges, CSV quoting and formula safety, XLSX and ZIP structure (round trip through the reader) |
| Database | `pnpm db:test` | `exp_*.test.sql`: import only into empty data; a chunk applies through the appliers and rolls back on a refusal; interest marks only on the session's rows; abort resets; another user's session refused; history events |
| Integration | `pnpm --filter @ft/web test:int` | export (pull) → backup → reset → import → identical balances, person balances, month totals, plan and templates (SC-001); a bad chunk undoes the import; locked backup round trip |
| End-to-end | `pnpm e2e` | `r10-*.spec.ts`, `a11y` |

## Manual validation (web)

| # | Steps | Expected |
|---|-------|----------|
| S1-a | Export › Backup | A `.json` downloads; it names the format, version and date |
| S1-b | Reset my data → Import the backup | Contents shown → Import → every screen as before; the report counts what was restored |
| S1-c | Import a backup into data that is not empty | Asked to reset first, or Reset and import with RESET |
| S1-d | Import a damaged file, a CSV, or an edited backup with a missing account | Refused with what is wrong; nothing changes |
| S1-e | Export a locked backup, import with a wrong then the right password | Wrong refused; right restores |
| S2-a | Export › Excel, Everything | One workbook; Transactions and Split lines sheets; amounts formatted |
| S2-b | Export › CSV, Last month | A zip of CSV files; transactions only from last month; totals match Reports › Last month |
| S3-a | Export › Backup with attachments; reset; import | The demo receipt is back on the refrigerator |
