# Quickstart: Dashboard, Reports & Statements (R6)

Local stack as R1–R5; load the demo household (Settings › Your data). Synthetic data only.

## Automated

| Suite | Command | Covers |
|-------|---------|--------|
| Core | `pnpm test` | report tree, trend, safe to spend, statements (vectors), PDF writer |
| Database | `pnpm db:test` | `rpt_*.test.sql`: own data only, counting rules, new fields |
| Integration | `pnpm --filter @ft/web test:int` | readers vs core parity; payee-level search equals the tree |
| End-to-end | `pnpm e2e` | `r6-*.spec.ts`, a11y; `r6-performance` with `E2E_PRODUCTION=1` |

## Manual validation (web)

| # | Steps | Expected |
|---|-------|----------|
| S1-a | Demo household → Dashboard | Net worth as on Accounts; this month's income/spending; safe to spend with its parts; To confirm; people totals |
| S1-b | Set buffer ₹5,000 | Safe to spend falls by ₹5,000.00 |
| S2-a | Reports › Spending › last month → Food & groceries → Groceries → Fresh Mart | Exactly those transactions; each level adds up |
| S3-a | Reports › Trend | 12 months of income, spending and net; a month opens its drill-down |
| S4-a | Ravi Kumar › Statement, 01-Apr-2026 – 31-Oct-2026 → PNG and PDF | Opening, rows with running balance, closing in words; files match the screen; notes only when switched on |
