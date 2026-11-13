# Validation: Dashboard, Reports & Statements (R6)

Run on 2026-11-07 – 2026-11-13 against the local Supabase stack, on branch `006-dashboard-reports`
with `main` merged. Environment: Windows 11, Chromium. All data is synthetic (`@example.com` users,
the generated demo household). Steps are in [quickstart.md](quickstart.md).

## Automated suites

| Suite | Command | Result |
|-------|---------|--------|
| Core unit (Vitest) | `pnpm test` | `@ft/core` 27 files, 241 passed. R6 adds `reports` 17, `statements` 20 and `pdf` 4. |
| Web / DB / Mobile unit | `pnpm test` | `@ft/web` 23, `@ft/db` 5, `@ft/mobile` 47 passed |
| Database (pgTAP) | `pnpm db:test` | 26 files, 464 tests, PASS (R6: `rpt_readers` 14) |
| Integration | `pnpm --filter @ft/web test:int` | 15 files, 75 passed. R6 adds reader/core parity and the last-level search; `/api/me` now expects `bufferMinor`. |
| End-to-end (Playwright) | `pnpm exec playwright test` R6 specs, `us5-shell`, `us7-hide-balances`, `a11y` | 26 passed after one fix (below) |
| Typecheck / Lint | `pnpm typecheck`, `pnpm lint` | PASS, no warnings |
| Performance | `r6-performance` with `E2E_PRODUCTION=1` | Not run locally (needs a production build on a quiet machine). The spec checks SC-003. |

**Fix found by the run:** at 390 px the trend chart's horizontal scroll area could not be focused
(axe `scrollable-region-focusable`). It is now a labelled, focusable region.

**About local timing:** the Android emulator of the parallel session kept the machine's CPU busy
during these runs. Some first visits to a page took longer than the default 5 s, because the dev server
compiles the page on first visit. Two statement tests then timed out at different steps on reruns.
Every R6 test passed in at least one full run, and none failed on a wrong figure. The full suite runs
on CI for the PR.

## Quickstart rows → evidence

| Row | Covered by | Result |
|-----|-----------|--------|
| S1-a | `r6-us1-dashboard`: owned, owed, net worth and people figures equal Accounts and People; To confirm opens Transactions | PASS |
| S1-b | `r6-us1-dashboard`: a ₹5,000.00 buffer lowers safe to spend by exactly that, and Settings shows it | PASS |
| S2-a | `r6-us2-drilldown`: last month → Food & groceries → Groceries → Fresh Mart. Each level adds up; the transactions total the payee; the breadcrumb keeps the period; 4 selections (SC-004). | PASS |
| US2 6–7 | `r6-us2-drilldown`: income the same way, the table view, and keyboard Enter on a bar | PASS |
| S3-a | `r6-us3-trend`: 12 months; this month equals the Dashboard; a month opens spending with that month's total | PASS |
| S4-a | `r6-us4-statement`: running balance row by row, closing equals the person's balance, PNG and PDF downloads named after the person and range, notes only when switched on, sign setting flips figures and keeps the words | PASS |
| US4 4–5 | `r6-us4-statement`: an empty range says so; hide-balances masks the screen, and the PDF is still made | PASS |
| SC-002 | `reports.test.ts` vectors and the integration parity test | PASS |
| SC-006 | `us7-hide-balances`: `/`, each report view and the statement masked | PASS |
| Accessibility | `a11y` "R6 Dashboard, Reports …" at 1280 and 390 px, the table view, a drill step by keyboard, the buffer form | PASS |

The downloaded statement image was also checked by eye. It shows the display name, the range, what
the sign means, the opening balance, rows with signed amounts and running balance, the included note
and the closing balance in words, with no account names.

## Not covered here

- Android (US5, T020): carried to the Android phase.
- SC-003 timings on a production build: the spec is ready (`r6-performance.spec.ts`), but it has not
  been run here.
- SC-005 (download within 5 s) was not timed separately. In the e2e runs both downloads completed
  well within the test's waits.
