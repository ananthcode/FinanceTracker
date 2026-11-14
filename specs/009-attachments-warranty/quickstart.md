# Quickstart: Attachments & Warranty Flag (R9)

Local stack as for R1–R8 (Supabase Storage is part of `pnpm db:start`). Load the demo household from
Settings › Your data (synthetic data only).

## Automated

| Suite | Command | Covers |
|-------|---------|--------|
| Core | `pnpm test` | `attachments` (types, sizes, `fitWithin`, allowance) and `warranty` (reminder days, dismissals, time left in words) vectors |
| Database | `pnpm db:test` | `att_*.test.sql`: storage RLS (own folder only), applier (object must exist with that size, limits, quota), deleting a transaction deletes its attachments, warranty fields and rules, pull, reset, erasure, audit |
| Integration | `pnpm --filter @ft/web test:int` | upload + record round trip; another user cannot open, list or remove a file; orphan clean-up; reset removes files |
| End-to-end | `pnpm e2e` | `r9-*.spec.ts`, `a11y`, `us7-hide-balances` |

## Manual validation (web)

| # | Steps | Expected |
|---|-------|----------|
| S1-a | A transaction → Attach a receipt → a 4 MB photo | Listed with a preview; stored under 1 MB; Open shows it |
| S1-b | Attach a PDF; open it; delete it | Opens; after delete it is gone |
| S1-c | Pick a .docx, or a 12 MB PDF | Refused with what is allowed |
| S1-d | Delete a transaction with 2 attachments | The warning says 2 attachments go too; they are gone |
| S2-a | Mark a purchase under warranty until a date 50 days away | Warranties lists it with "expires in 50 days"; the Dashboard shows a reminder; Got it hides it |
| S2-b | Settings: first reminder 90 days, second off | Reminders follow the new days |
| S2-c | Transactions › filter Under warranty | Only those |
| S3-a | Settings › Your data | Files and space used of 200 MB |
| S3-b | Reset my data | Every file is gone from storage |
