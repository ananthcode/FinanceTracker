# Validation: Quick-add Templates (R8)

Run on 2026-11-14 against the local Supabase stack, on branch `008-quick-add-templates`. Environment:
Windows 11, Chromium, `next dev`. All data is synthetic (`@example.com` users, the generated demo
household). Steps are in [quickstart.md](quickstart.md).

## Automated suites

| Suite | Command | Result |
|-------|---------|--------|
| Core unit (Vitest) | `pnpm test` | `@ft/core` 32 files, 336 passed. R8 adds `templates` (11: shapes per kind, recording, amount box, missing references, tie fit and month, Save as template, order) and `demo-templates` (2). |
| Web / DB / Mobile unit | `pnpm test` | `@ft/web` 23, `@ft/db` 5, `@ft/mobile` 47 passed |
| Database (pgTAP) | `pnpm db:test` | 35 files, 590 tests, PASS. R8: `tpl_rls` 10, `tpl_apply` 19, `tpl_data` 11; `data_reset` expects the template count. |
| Integration | `pnpm --filter @ft/web test:int` | 17 files, 82 passed. R8: `templates-sync` (push/pull, per-field merge, a tied recording links; a wrong month refused); demo load counts 5 templates. |
| End-to-end (Playwright) | `pnpm exec playwright test` (every module, R1–R8) | **118 passed, 6 skipped** (the six production-only performance checks), 0 failed, in 24.3 min |
| Typecheck / Lint | `pnpm typecheck`, `pnpm lint` | PASS, no warnings |
| Performance | `r8-performance` with `E2E_PRODUCTION=1` | Not measured on a production build (see below) |

**Fixes found by the runs:**
- Following a template link on the add-transaction form kept the previous (empty) form: the form is now
  keyed by what it was opened with.
- The "Recorded …" message first used a raw money formatter; lint refused it, and it now uses `<Money>`, so
  hide-balances masks it.

**Performance (SC-004):** the spec seeds 100 templates and times the Transactions page with its quick-add
list (< 1 s) and a recording (< 1 s). Run once against the dev server to check the spec works: the full
Transactions page took 1.13 s in dev mode — not a production figure. Like R6 and R7 it needs a production
build on a quiet machine.

## Quickstart rows → evidence

| Row | Covered by | Result |
|-----|-----------|--------|
| S1-a | `r8-us1-record`: Record on Milk → one transaction today, ₹60.00, Sunrise Dairy; Cash in hand down by exactly ₹60.00 (SC-002) | PASS |
| S1-b | `r8-us1-record`: Undo within 10 s → gone; balance exactly as before | PASS |
| S1-c | `r8-us1-record`: Groceries empty box refused ("Enter the amount."); ₹1,240.00 recorded; Milk at ₹75.00 this time, template still ₹60.00 | PASS |
| S1-d | `r8-us1-record`: second Record within 10 s asks "Record it again?"; Cancel records nothing | PASS |
| S1-e | `r8-us1-record`: Repay Meera → "pays Repay Meera (<month>)", the plan shows Paid; again → recorded, "not linked: … already paid" | PASS |
| US1 6 | `r8-us1-record`: Edit first opens the form filled in (amount, account, today); saved once | PASS |
| S2-a / SC-003 | `r8-us2-manage`: Save as template from a Corner Cafe expense — name suggested, amount kept, no date/status — saved in well under 30 s | PASS |
| S2-b / SC-005 | `r8-us2-manage`: Move to top / Move down; the same order on Transactions; Hide → off the list, kept in Manage; Show | PASS |
| US2 1, 4, 5 | `r8-us2-manage`: name taken refused; a person template's tie lists only fitting planned payments; editing Milk to ₹65.00 leaves the ₹60.00 recording; delete keeps recordings | PASS |
| S3-a | `r8-us3-where`: Dashboard strip (5 demo templates), Record from it, More → Transactions | PASS |
| S3-b | `r8-us3-where`: "Start from a template" → Wallet top-up fills the form | PASS |
| US3 3 | `r8-us3-where`: with none, no Dashboard strip; Transactions explains and offers Make a template | PASS |
| S4-a / FR-014 | `us7-hide-balances`: Transactions, Manage templates and the Dashboard masked; the box shows `••••` | PASS |
| SC-006 | `a11y` "R8 Quick add …": quick add, Dashboard, Manage, new and edit forms at 1280 and 390 px; Record and Undo by keyboard; the repeat dialog; reorder by keyboard | PASS |
| Missing references (US1 7, FR-011) | Core `templateProblems` vectors; the form shows what to choose. Not driven end to end (it needs a demo payee deleted or an account archived). | PASS (core) |
| Split template amount (US1 5) | Core `readAmountBox` vectors (a changed split amount opens the form). Not driven end to end (the demo has no split template). | PASS (core) |

## Not covered here

- Android (US4, T021): quick add on the phone's home screen, offline recording, manage templates — carried
  to the Android phase. The phone's sync already pulls templates and the row mapper reads them (T005).
- SC-004 timings on a production build: the spec is ready (`r8-performance.spec.ts`) but was not run on a
  production build here.
