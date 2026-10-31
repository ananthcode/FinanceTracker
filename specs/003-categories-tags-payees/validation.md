# Validation: Categories, Tags & Payees (R3)

Run on 2026-10-29 … 2026-10-31 against the local Supabase stack, branch
`003-categories-tags-payees`, Windows 11, Chromium. All data is synthetic (`@example.com` users,
invented shops and people). Steps are in [quickstart.md](quickstart.md).

## Automated suites

| Suite | Command | Result |
|-------|---------|--------|
| Core unit (Vitest) | `pnpm test` | `@ft/core` 139 passed (18 files; R3 adds schemas, tree, search, merge rules, defaults, people, demo lists, people in net worth) |
| Web unit (Vitest) | `pnpm test` | `@ft/web` 23 passed (incl. every icon key renders) |
| DB unit (Vitest) | `pnpm test` | `@ft/db` 5 passed |
| Mobile unit (Jest) | `pnpm test` | `@ft/mobile` 9 passed |
| Database (pgTAP) | `pnpm db:test` | 16 files, 290 tests, PASS (R3: `lists_rls` 21, `lists_apply` 45, `lists_merge` 24, `lists_audit` 14, `lists_start` 12) |
| Integration | `pnpm --filter @ft/web test:int` | 10 files, 46 passed (R3: lists sync with two devices 5, start choice 6, more than 1,000 payees 1, person balance parity 1) |
| End-to-end (Playwright) | `pnpm e2e` | 61 passed, 2 skipped (production-only performance tests), 2 failed — see below |
| Performance, production build (SC-002) | quickstart.md § Performance | Categories ≈ 0.63–0.72 s, Payees (2,000) ≈ 0.94–0.97 s (limit 2 s); category search 78–80 ms, payee search 95–169 ms, picker 67–73 ms (limit 1 s) — PASS, two runs |
| R2 performance (SC-003), same build | — | 723–734 ms — PASS (no regression) |
| Typecheck / Lint | `pnpm typecheck`, `pnpm lint` | PASS, no warnings |

**End-to-end failures in the full run:**

- `us3-preferences` (R1) — a regression found by this run: the settings forms sent the new
  `categoriesStart` back to the strict preferences endpoint. Fixed (web and Android forms); rerun
  PASS.
- `a11y` keyboard reordering (R2) — the known CI timing issue fixed by PR #4, which is not yet on
  this branch. Passes once #4 is merged into `main` and `main` into this branch.

## Quickstart rows → evidence

| Row | Covered by | Result |
|-----|-----------|--------|
| S1-a | `r3-us1-categories` "the start choice adds the suggested … trees once" | PASS |
| S1-b | `r3-us1-categories` "add nested categories, rename, move and find them by path" (SC-001 < 30 s) | PASS |
| S1-c | same test (sibling clash, move into own subtree not offered); `lists_apply` | PASS |
| S1-d | `r3-us1-categories` "starting empty offers Add suggested categories" | PASS |
| S2-a | `r3-us2-payees` (default category, notes, name clash links the existing payee, search, renamed category path; SC-001); start choice from a picker | PASS |
| S3-a | `r3-us3-people` "people with balances in both directions and the two totals" | PASS |
| S3-b | `r3-us3-people` "the net-worth switch moves a person's balance into the accounts summary" | PASS |
| S3-c | `r3-us3-people` hide-balances; `us7-hide-balances` now covers `/people` and `/settings/payees` (SC-007) | PASS |
| S4-a | `r3-us4-tags` (create, case-insensitive clash, rename, merge, delete) | PASS |
| S5-a | `r3-us5-cleanup` hide / unhide a category (out of pickers, kept on the screen) | PASS |
| S5-b | `r3-us5-cleanup` category merge (nested same-name merge, payee defaults) and payee/person merges (balances added) | PASS |
| S5-c | `r3-us5-cleanup` delete a leaf (payee default cleared), parent refused | PASS |
| S-perf | `r3-performance` against a production build | PASS (above) |
| S-iso | pgTAP `lists_rls` (other user, owner-admin, direct REST writes, pull, history, erasure), `lists_apply`/`lists_start` (cross-user ids, direct preference update refused) | PASS |
| Accessibility | `a11y` "R3 lists" — axe WCAG 2.1 AA on every R3 screen at 1280 and 390 px, start dialog, Manage panel, open picker; keyboard tree disclosure and picker | PASS |
| S6-a–c (Android) | Deferred to the Android phase (T070–T072); server side covered by `lists-sync.int.test.ts` | Not run |

The manual rows were not repeated by hand: each has an automated test that performs the same steps
and checks the same outcome.

## Issues found during validation (all fixed)

1. **More than 1,000 payees showed only 1,000** — the API caps a request at 1,000 rows. List
   repositories now read every page; regression test added. (Found by the SC-002 test.)
2. **Start choice from a picker reloaded the page** — the dialog's form was nested inside the payee
   form. The shared `Dialog` is now portalled and stops submit events.
3. **Settings could not be saved** — see `us3-preferences` above.
4. **Picker "no matches" message inside the listbox** (axe `aria-required-children`) — now a
   status message.
5. **Payees screen at 2.1 s with 2,000 payees** — the list renders 200 rows at a time; now ≈ 0.95 s.
6. Smaller: the "Top level" option was hidden while typing; the start dialog could reopen once
   after answering; a floating suggestion list covered dialog buttons.
