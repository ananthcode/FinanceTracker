# Quickstart: Quick-add Templates (R8)

Local stack as for R1–R7. Load the demo household from Settings › Your data (synthetic data only).

## Automated

| Suite | Command | Covers |
|-------|---------|--------|
| Core | `pnpm test` | `templates` vectors: schemas per kind, split amount rule, `recordFromTemplate`, `templateProblems`, `templateFitsPlan`, `tiedPlanMonth`, `templateFromTransaction` names, order |
| Database | `pnpm db:test` | `templates_*.test.sql`: RLS, applier checks and codes, name and limit, tie fits, merges and tag delete reaching templates, pull, reset, erasure, audit |
| Integration | `pnpm --filter @ft/web test:int` | push/pull round trip; a recording from a tied template links through R4/R7 rules |
| End-to-end | `pnpm e2e` | `r8-*.spec.ts`, `a11y` (quick add, manage, form at 1280 and 390 px), `us7-hide-balances` |

## Manual validation (web)

| # | Steps | Expected |
|---|-------|----------|
| S1-a | Demo → Transactions → Record on "Milk" | One transaction today, ₹60.00 from Cash in hand; "Recorded Milk …" with Undo |
| S1-b | Undo within 10 s | The transaction is gone; balances as before |
| S1-c | "Groceries" (amount each time): type 1,240.00 → Record | Recorded with ₹1,240.00; empty box refused |
| S1-d | Record "Milk" twice quickly | "Record it again?" |
| S1-e | Tied "Repay Meera" → Record | Linked to the plan's unpaid month; message says so |
| S2-a | A transaction → Save as template | Form filled; saved; appears in the list |
| S2-b | Manage templates: move to top, hide, show, delete | Order and visibility as set |
| S3-a | Dashboard | Quick add strip, first 6, More |
| S3-b | Add transaction → Start from a template | Form filled; nothing saved until Save |
| S4-a | Hide balances | Every template amount masked |
