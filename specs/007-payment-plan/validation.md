# Validation: Monthly Payment Plan (R7)

Run on 2026-11-13 – 2026-11-14 against the local Supabase stack, on branch `007-payment-plan`.
Environment: Windows 11, Chromium, `next dev`. All data is synthetic (`@example.com` users, the
generated demo household). Steps are in [quickstart.md](quickstart.md).

## Automated suites

| Suite | Command | Result |
|-------|---------|--------|
| Core unit (Vitest) | `pnpm test` | `@ft/core` 30 files, 323 passed. R7 adds `plan` (months, terms, planned amounts, statuses, totals, carry-forward), `plan-match` (matching, Pay draft, safe to spend, nudge) and `demo-plan`; `reports` gains the plan part of safe to spend. |
| Web / DB / Mobile unit | `pnpm test` | `@ft/web` 23, `@ft/db` 5, `@ft/mobile` 47 passed |
| Database (pgTAP) | `pnpm db:test` | 31 files, 549 tests, PASS. R7: `plan_rls` 18, `plan_apply` 31, `plan_links` 23, `plan_data` 12; `data_reset` expects the plan counts. |
| Integration | `pnpm --filter @ft/web test:int` | 16 files, 80 passed. R7: `plan-sync` (push/pull round trip, two devices merging one item-month, occurrence id SQL = TS on 50 random pairs, preferences forward-only); `/api/me` now expects `planNudge` and `planCheckedMonth`; demo load counts the plan. |
| End-to-end (Playwright) | `pnpm exec playwright test` (every module, R1–R7) | **110 passed, 5 skipped** (the five production-only performance checks), 0 failed, in 21.7 min |
| Typecheck / Lint | `pnpm typecheck`, `pnpm lint` | PASS, no warnings |
| Performance | `r7-performance` with `E2E_PRODUCTION=1` | Not measured on a production build (see below) |

**Fixes found by the runs:**
- At 390 px the comparison table's horizontal scroll area could not be focused (axe
  `scrollable-region-focusable`). It is now a labelled, focusable region.
- `/api/me`'s defaults test listed the preferences exactly; it now includes the two plan preferences.
- An earlier run had five unrelated tests fail at sign-in. Cause: the dev server had stopped responding
  (low memory with the Android emulator running), and then Docker Desktop would not start because of two
  stale socket files, which were moved aside. On a fresh server all five passed, and the full run above
  is clean.

**Performance (SC-003):** the spec seeds 100 items with 24 months of linked payments (2,400
transactions) and times the plan screen (< 2 s) and a month change (< 1 s). Run once against the dev
server only to check the spec works: the seed and flow ran, and the plan screen took 4.6 s in dev mode
(which compiles and renders without production optimisations) — not a production figure. Like R6, it
needs a production build on a quiet machine; this machine had about 3 GB free with the emulator running.

## Quickstart rows → evidence

| Row | Covered by | Result |
|-----|-----------|--------|
| S1-a | `r7-us1-plan`: demo household → this month's items by due date, statuses in words, planned = paid + still to pay; last month's electricity carried over as Overdue with its month | PASS |
| S1-b | `r7-us1-plan`: ‹ to last month (Rent paid, Electricity overdue), › to next month (rent's upcoming payment linked, subscription skipped, electricity estimated); range from April 2025 to 24 months ahead | PASS |
| S2-a | `r7-us2-items`: monthly, every 3 months, yearly and one-off items appear in exactly their months; due day 31 is the month's last day | PASS |
| S2-b | `r7-us2-items`: Electricity next month "estimated"; set ₹2,150.00 → the label goes; the month after is still estimated | PASS |
| S2-c | `r7-us2-items`: from next month's view, Home loan EMI → ₹43,000.00 ("Apply from" defaults to the viewed month, min the current month); this month keeps ₹42,500.00 | PASS |
| US2 5 / FR-008 | `r7-us2-items`: skip and undo (totals restored exactly); End after a month; delete keeps paid months as "(removed)" | PASS |
| S3-a / SC-004 | `r7-us3-pay`: Pay → Save (2 selections); one transaction; the account balance changes once, by exactly the amount (SC-002) | PASS |
| S3-b | `r7-us3-pay`: ₹2,000.00 of ₹5,000.00 → "₹3,000.00 left"; Pay pre-fills ₹3,000.00; then Paid with two payments listed | PASS |
| S3-c | `r7-us3-pay`: a new Stream Plus expense offers "Pays: Stream Plus (<month>)" ticked; saved → Paid | PASS |
| S3-d | `r7-us3-pay`: "Looks paid — link?" on last month's electricity links it in one selection | PASS |
| S3-e / FR-020 | `r7-us3-pay`: the transaction shows "Pays:", warns before void and delete; void → the item is unpaid again; unlink leaves the transaction | PASS |
| US3 3 | `r7-us3-pay`: in Link existing, a transaction already paying Rent is shown with "Already pays …" and cannot be chosen | PASS |
| S4-a | `r7-us4-overdue`: Cash in hand shows still to pay, available and short by, where short by = still to pay − available exactly | PASS |
| SC-005 | `r7-us4-overdue`: the carried month is counted in this month only ("Counted in <month>" elsewhere); paying it clears it from every month | PASS |
| S5-a / SC-006 | `r7-us5-compare`: difference in words equals the difference of the planned totals; people totals equal the People screen; a person opens | PASS |
| S6-a / SC-008 | `r7-nudge` (browser clock set): nudge on the 3rd (this month) and from the 25th (next month), none on the 6th, 10th or 24th; estimated count; Open month; Not now until the next day; Plan checked stops it and is saved for every device | PASS |
| S6-b | `r7-nudge`: Settings switch off → no nudge; "Plan checked" only on the nudge's month; switched on again, a checked month stays checked | PASS |
| S7-a / SC-006 | `r7-nudge`: a new ₹1,000.00 item lowers safe to spend by exactly ₹1,000.00; one from an account outside net worth does not | PASS |
| S7-b | `us7-hide-balances`: every plan amount masked; statuses remain | PASS |
| SC-007 | `a11y` "R7 Payment plan …": three months with the nudge, the item form, the edit form and the Dashboard at 1280 and 390 px; Set amount open; the link dialog; Pay by keyboard only | PASS |
| SC-004 (setup < 1 minute) | `r7-us2-items` adds four items in one test; each add (fill and save) took a few seconds of the 34 s test, well under a minute | PASS (timed by the test run, not by a person) |

## Not covered here

- Android (US6, T036): the plan, Pay and link, the item form, the nudge and the setting on Android,
  carried to the Android phase. The phone's sync already pulls the new entities and link fields, and
  the row mappers read them (T005).
- SC-003 timings on a production build: the spec is ready (`r7-performance.spec.ts`) but was not run on
  a production build here.
