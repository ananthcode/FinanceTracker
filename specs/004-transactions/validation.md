# Validation: Transactions (R4)

Run on 2026-10-31 against the local Supabase stack, branch `004-transactions` (with `main` merged,
Next.js 16.4.3), Windows 11, Chromium. All data is synthetic (`@example.com` users, invented shops
and people). Steps are in [quickstart.md](quickstart.md).

## Automated suites

| Suite | Command | Result |
|-------|---------|--------|
| Core unit (Vitest) | `pnpm test` | `@ft/core` 194 passed (23 files; R4 adds transaction schemas, postings vectors, labels and totals, running person balances, interest vectors, demo transactions) |
| Web unit (Vitest) | `pnpm test` | `@ft/web` 23 passed |
| DB unit (Vitest) | `pnpm test` | `@ft/db` 5 passed |
| Mobile unit (Jest) | `pnpm test` | `@ft/mobile` 23 passed |
| Database (pgTAP) | `pnpm db:test` | 23 files, 420 tests, PASS (R4: `tx_apply` 54, `tx_rls` 19, `tx_audit` 7, `tx_interest` 15, `tx_relocate` 16, `tx_search` 18) |
| Integration | `pnpm --filter @ft/web test:int` | 12 files, 56 passed (R4: transactions through push/pull with two devices 6, interest route 2, SQL/core parity for postings and interest) |
| End-to-end (Playwright) | `pnpm e2e` | Full run 81 passed, 3 skipped (production-only performance tests), 1 failed — see below; after the fix, the interest and people specs 15/15 (three times each) |
| Performance, production build (SC-003) | R2 quickstart § Performance | 20,000 transactions: list 0.50 s, Load more 0.47 s (limits 2 s / 1 s); text search 0.55 s, type and date filter 0.53 s (limit 1 s); Accounts with balances 0.61 s (limit 2 s) — PASS |
| R2 SC-003 and R3 SC-002, same build | — | PASS (no regression; categories 0.63 s, payees 0.89 s, searches < 0.1 s) |
| Typecheck / Lint | `pnpm typecheck`, `pnpm lint` | PASS, no warnings |

**Getting the full run green:**

- The first full runs failed in bulk with timeouts: the production build for SC-003 had overwritten
  the running dev server's `.next` cache. Clearing it and warming the server fixed that.
- Clicks and typing made before React had taken over a page were lost on this machine (R2 account
  saves, the admin Enable/Disable, the R2 keyboard reorder). The root layout now marks
  `<html data-hydrated>` (`components/HydrationMark.tsx`), and every spec's `page.goto` / `reload`
  waits for it (`e2e/fixtures.ts`); sign-in waits for it too. The R2 reorder test also waits for its
  save before reloading.
- `r4-us4-interest` "manual interest …" found a real UI glitch: two quick saves on the person page
  (the interest setting, then a rate) each refresh the page, and the second refresh could be
  overtaken, so the new rate did not show. The interest section now shows saved changes at once.

## Quickstart rows → evidence

| Row | Covered by | Result |
|-----|-----------|--------|
| S1-a | `r4-us1-record` "an expense and an income move the balance and list newest first" (default category from the payee; SC-001 < 20 s) | PASS |
| S1-b | `r4-us1-record` "no category is Uncategorised …" | PASS |
| S1-c | same test (refund adds back); `categoryTotals` unit test (refund reduces spending) | PASS |
| S1-d | `r4-us1-record` "a date before the account's opening balance is refused with a link" | PASS |
| S1-e | `r4-us1-record` "an upcoming transaction counts only once confirmed after its date" (nav "1 to confirm") | PASS |
| S2-a | `r4-us2-transfer` (card owed ₹0.00, net worth unchanged, net total ₹0.00; SC-001) | PASS |
| S3-a | `r4-us3-people` (lent, received back, paid on behalf; running balance on the person page) | PASS |
| S3-b | `r4-us5-splits` "part of a bill paid on a friend's behalf is not spending" | PASS |
| S5-a | `r4-us5-splits` "a bill split into three categories saves only when the lines add up" | PASS |
| S6-a | `r4-us6-find` (category with sub-categories in a date range: count and net total; bulk tag; relocate FreshMart → Fresh Mart) | PASS |
| S7-a | `r4-us7-status` (Cleared, Follow-up, Void struck through and uncounted) | PASS |
| S-del | `r4-us6-find` (used payee refused, hide or merge offered); `tx_apply` (used category / payee) | PASS |
| US4 1–5 | `r4-us4-interest` (proposals compound, edit + confirm stands, later month follows, deleted never recreated, manual creates none); `tx_interest`; interest parity | PASS |
| SC-006 | `us7-hide-balances` "the transaction screens are masked too" | PASS |
| SC-007 | interest vectors in core and SQL, including confirmation order | PASS |
| SC-008 (server) | `tx-sync.int.test.ts` "50 offline changes from two devices" | PASS |
| Accessibility | `a11y` "R4 transactions …" (axe at 1280 / 390 px; keyboard combobox; split editor) | PASS |

## Not covered here

- Android screens and push notification (T053, T054): carried to the Android phase (`ft-side`).
