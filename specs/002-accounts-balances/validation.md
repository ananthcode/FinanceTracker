# Validation: Accounts & Balances (R2)

Run on 2026-10-26/27 against the local Supabase stack, branch `002-accounts-balances`, Windows 11,
Chromium. All data is synthetic (`@example.com` users, demo account names). Steps are in
[quickstart.md](quickstart.md).

## Automated suites

| Suite | Command | Result |
|-------|---------|--------|
| Core unit (Vitest) | `pnpm test` | `@ft/core` 94 passed (12 files) |
| Web unit (Vitest) | `pnpm test` | `@ft/web` 22 passed (5 files) |
| DB unit (Vitest) | `pnpm test` | `@ft/db` 5 passed |
| Mobile unit (Jest) | `pnpm test` | `@ft/mobile` 9 passed (R1 only; R2 Android client deferred) |
| Database (pgTAP) | `pnpm db:test` | 10 files, 173 tests, PASS (R2: `accounts_rls` 25, `accounts_apply` 46, `accounts_audit` 19) |
| Integration | `pnpm --filter @ft/web test:int` | 7 files, 33 passed (push 7, pull 6, accounts view 2, SQL parity 2, plus R1) |
| End-to-end (Playwright) | `pnpm e2e` | 47 passed, 1 skipped (`r2-performance`, production build only — row below), 7.0 min |
| Performance, production build (SC-003) | see quickstart.md § Performance | 100 accounts (50 active + 50 archived): screen complete in about 0.75–0.8 s, limit 2 s — PASS |
| Typecheck | `pnpm typecheck` | PASS |
| Lint | `pnpm lint` | PASS, no warnings |

## Quickstart rows → evidence

| Row | Covered by | Result |
|-----|-----------|--------|
| S1-a | `r2-us1-add-accounts` "an empty Accounts screen…" | PASS |
| S1-b | `r2-us1-add-accounts` "added accounts are listed by type…" (also SC-001) | PASS |
| S1-c | `r2-us1-add-accounts` "bad input is refused…"; `parse-amount` unit tests | PASS |
| S2-a | `r2-us2-net-worth` "summary shows Owned, Owed and Net worth…"; `accounts-summary` vectors | PASS |
| S2-b | `r2-us2-net-worth` "overdrawn and excluded accounts are labelled…" | PASS |
| S2-c | `r2-us2-net-worth` "hide balances masks every amount…"; `us7-hide-balances` SC-006 list includes `/accounts` | PASS |
| S3-a | `r2-us3-edit-groups` "editing updates the list…" and "reordering by button and by keyboard drag…" (second browser context) | PASS |
| S3-b | `r2-us3-edit-groups` "changing owned to owed asks first…" | PASS |
| S3-c | `r2-us3-edit-groups` "own groups: create, assign, switch view…" | PASS |
| S4-a | `r2-us4-archive` "archive at ₹0.00, refuse with a balance, restore in place" | PASS |
| S4-b | `r2-us4-archive` "delete removes a never-used account…" | PASS |
| S4-c | `r2-us3-edit-groups` "two tabs editing different fields keep both changes"; `merge` vectors in TS and SQL | PASS |
| S-perf | `r2-performance` against a production build | PASS (see above) |
| S-iso | pgTAP `accounts_rls` (other user, owner-admin, direct REST writes, `pull_changes`, audit rows) and `accounts_apply` (cross-user ids); `pull.int` "never another user's rows" | PASS |
| Accessibility | `a11y` "accounts screens with the demo accounts, both views" (axe WCAG 2.1 AA at 1280 and 390 px) and "accounts: keyboard reordering…" | PASS |
| S5-a–e (Android) | Deferred to the Android phase (T059–T063). Server side covered by push/pull integration tests | Not run |

The manual rows were not repeated by hand: each one has an automated test that performs the same
steps and checks the same outcome.

## Issues found during validation

- Two R1 end-to-end tests assumed `/accounts` was still a placeholder or had headroom under the 30 s
  test limit. `us5-shell` now checks "Coming soon" only on placeholder sections; the two long
  accessibility scans and the S3-c groups test use `test.slow()`.
- One run on a loaded machine (a production server left running beside the dev server) timed out
  three page loads in unrelated tests; the same tests passed on rerun with the extra server stopped.
  Not a product defect.
