# Validation: Demo Data (R5)

Run on 2026-11-01 against the local Supabase stack, branch `005-demo-data` (with `main` merged),
Windows 11, Chromium. All data is synthetic (`@example.com` users, the generated demo household).
Steps are in [quickstart.md](quickstart.md).

## Automated suites

| Suite | Command | Result |
|-------|---------|--------|
| Core unit (Vitest) | `pnpm test` | `@ft/core` 200 passed (R5 adds `demoChanges`: valid on the wire, fresh ids, every reference remapped, same records for every user) |
| Web / DB / Mobile unit | `pnpm test` | `@ft/web` 23, `@ft/db` 5, `@ft/mobile` 37 passed |
| Database (pgTAP) | `pnpm db:test` | 25 files, 450 tests, PASS (R5: `data_load` 13, `data_reset` 17) |
| Integration | `pnpm --filter @ft/web test:int` | 14 files, 65 passed (R5: `/api/me/data` 7 — load and same-day balances for two users, concurrent loads, demo-only, typed RESET, reset and load, 20,000-transaction reset < 10 s, reset point through pull and push) |
| End-to-end (Playwright) | `pnpm e2e` | R5 specs 4/4 and the R5 accessibility test PASS locally. A clean local full run was not possible (below); the full suite is run by CI on the PR |
| Typecheck / Lint | `pnpm typecheck`, `pnpm lint` | PASS, no warnings |

**About the full end-to-end runs:** the local full runs failed in bulk with timeouts, not wrong
results. One overlapped the integration suite (which resets 20,000 transactions) on the same database.
During the others the machine's CPU was at about 90%, mostly the Android emulator of the parallel
Android session: the dev server's own proxy step took 400–700 ms instead of ~100 ms and pages took
2–5 s. On a freshly started server with the machine quieter, adding an account takes about 2 s
(pages ~0.5 s, the save ~0.3–0.5 s), and every database call a page makes takes under 50 ms — R5 did
not make the app slower. The full suite is therefore left to CI (`e2e` job, a clean machine).

## Quickstart rows → evidence

| Row | Covered by | Result |
|-----|-----------|--------|
| S1-a | `r5-us1-load` (summary in words within 10 s, every screen filled, To confirm present, no start choice) | PASS |
| S1-b | integration "loads the demo household … the same for every user on the same day" | PASS |
| S2-a | `r5-us2-reset` "reset asks for the word …" (first-use screens, start choice again, preferences kept) | PASS |
| S2-b | `r5-us2-reset` "another open tab shows the reset state when it reloads" | PASS |
| S3-a | `r5-us3-reload` (fresh household replaces own records in one step, < 1 min) | PASS |
| SC-003 | integration "resets 20,000 transactions within 10 seconds" | PASS |
| SC-005 | `data_load` and `data_reset` pgTAP (another user's data and history unchanged) | PASS |
| Accessibility | `a11y` "R5 Settings › Your data" (both states, both dialogs, keyboard only) | PASS |

## Not covered here

- Android (US4, T022): carried to the Android phase — it must wipe its store on `reset: true` and
  drop `DATA_RESET` results.
