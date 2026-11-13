# Quickstart: Monthly Payment Plan (R7)

The local stack is as for R1–R6. Load the demo household from Settings › Your data; the data is
synthetic only. Tests that depend on dates fix "today" through the e2e clock (`page.clock`), so the
nudge window and overdue states are deterministic.

## Automated

| Suite | Command | Covers |
|-------|---------|--------|
| Core | `pnpm test` | `plan` vectors: frequencies, month ends, terms from a month, estimates, part and overpaid, carry-forward counted once, likely matches, Pay drafts, safe to spend with the plan, nudge window. Also `occurrenceId` parity cases |
| Database | `pnpm db:test` | `plan_*.test.sql`: own data only (RLS), appliers (validation, rejection codes, `TERMS_IN_PAST`, deterministic occurrence ids, a create for an existing occurrence merging), transaction links (`INVALID_PLAN_LINK`, one item-month per transaction), merges repointing items, audit rows, reset and erasure, preference grants |
| Integration | `pnpm --filter @ft/web test:int` | Push and pull round trip for the new entities; `occurrenceId` SQL = TS; `/api/me` returns `planNudge` and `planCheckedMonth`; a plan read through the repository equals core on the demo household |
| End-to-end | `pnpm e2e` | `r7-*.spec.ts`, `us5-shell` (Payment plan no longer a placeholder), `us7-hide-balances` (plan masked), `a11y` (plan at 1280 and 390 px); `r7-performance` with `E2E_PRODUCTION=1` |

## Manual validation (web)

| # | Steps | Expected |
|---|-------|----------|
| S1-a | Demo household → Payment plan | This month's items by due date with words for status. Planned = paid + still to pay (− overpaid). Last month's unpaid item under "Carried over" as Overdue with its month |
| S1-b | ‹ to last month, › to next month | Past month shows what was paid; next month shows planned and estimated amounts |
| S2-a | Add "Home loan EMI" ₹42,500 monthly on the 5th; "Car insurance" yearly in March; "School fees" every 3 months from April; a one-off "Wedding gift" this month | Each appears in exactly its months |
| S2-b | Mark "Electricity" as amount varies; view next month | Planned shows last month's paid amount, "estimated"; set ₹2,150 → the label goes |
| S2-c | From next month's view, edit Rent to ₹26,000 ("Apply from" = next month) | This month unchanged; next month and later ₹26,000 |
| S3-a | Pay on Rent → Save | One transaction, Rent Paid with amount and date; account balance changes once |
| S3-b | Card bill ₹20,000: pay ₹8,000 then ₹12,000 | Part paid "₹12,000.00 left", then Paid; both transactions listed |
| S3-c | Record an electricity expense from Transactions › New | "Pays: Electricity (<month>)" ticked; save → Electricity Paid |
| S3-d | An unlinked matching transaction exists | "Looks paid — link?" → one selection links it |
| S3-e | Void a linked transaction (warning shown) | The item goes back to Part paid, Due or Overdue |
| S4-a | Current month | "Cash by account" lists still to pay, balance and "short by" for short accounts |
| S5-a | Comparison and people panel | Last month's totals and the difference in words; people totals equal the People screen |
| S6-a | Clock on the 26th; Dashboard | "Check your plan for <next month>" with the estimated count; Not now hides it until tomorrow; Plan checked stops it |
| S6-b | Settings › turn the reminder off | No nudge on any day |
| S7-a | Dashboard safe to spend | Falls by the unpaid non-card plan items not already linked to upcoming transactions |
| S7-b | Hide balances | Every plan amount masked; statuses and words remain |
