# Finance Tracker — Roadmap (Phase 1: Daily driver)

Source requirement: [docs/SCOPE.md](docs/SCOPE.md) — Phase 1
Decomposed: 2026-10-10 · Approved by: owner, 2026-10-10

Each row is one bounded capability that goes through specify → plan → tasks → implement → converge.
Status: `todo` · `spec` · `plan` · `tasks` · `implementing` · `done`

**Phase 1 goal:** a **demo version** that runs entirely on realistic, synthetic demo data, so the owner
and invited testers can check that the core features work as expected on web and Android (online
and offline) before any real data is moved in. Feedback from the demo may add or change features.
Migration of real history from the Ivy-based wallet app is deliberately the **last phase** of the
project — the existing app stays in daily use until then.

| ID | Capability | Objective | Depends on | Priority | Status | Spec folder |
|----|------------|-----------|------------|----------|--------|-------------|
| R1 | Identity, access & app shell | Invite-only sign-up (single owner-admin manages invites), Google + email/password sign-in, per-user private data, user preferences (base currency, Indian number format, date format, Apr–Mar FY), app lock (PIN / fingerprint) and hide-balances mode, on web + Android shells | — | P0 | spec | [specs/001-identity-access-shell](specs/001-identity-access-shell/spec.md) |
| R2 | Accounts & balances | Create/edit/archive accounts (bank, cash, credit card, wallet) with opening balance, grouping, colour/icon/order; live balances and net-worth summary; **first data synced offline-first** | R1 | P0 | todo | |
| R3 | Categories, tags & payees | Unlimited nested categories (seeded with sensible Indian defaults), free-form tags, payees with default category & notes; payees are either **businesses or people**; **person payees carry a running ledger balance** ("I owe them" / "they owe me") with an opening balance; hide, merge and relocate for categories and payees | R1 | P0 | todo | |
| R4 | Transactions | Record income, expense and transfers (excluded from income/expense totals); split lines; payee, category, tags, notes, reference no., status; **person-ledger movements** — borrowed from / lent to a person, repaid, **paid on behalf of** a person and **collected on behalf of** a person (e.g., rent received for them) — both update their balance and are excluded from own spending/income; **interest on person loans** per person: rate any value incl. 0% with a rate history (changes take effect only from the 1st of a month); auto-accrued at month-end as that month's rate × the month's opening balance (compounds monthly, overridable) or entered manually; search, filter, bulk edit; offline entry; full edit history captured | R2, R3 | P0 | todo | |
| R5 | Demo data | Per-user "Load demo data" and "Reset / clear my data": a deterministic, synthetic Indian household with ~2 years of history across all Phase 1 account types, nested categories, payees, tags, splits and transfers — rich enough to exercise every screen and chart | R2, R3, R4 | P0 | todo | |
| R6 | Dashboard, drill-down reports & person statements | Home dashboard (net worth, this month's income/expense, safe-to-spend buffer) and interactive charts drilling category → sub-category → payee → transactions; income vs expense trend; **person statement** for any date range — opening balance, each movement with type label, signed amount and running balance, closing balance ("You owe X" / "X owes you"); sign direction set per person; **share as PNG image or PDF** (Android share sheet, web download) | R4 (R5 for realistic data) | P0 | todo | |
| R7 | Monthly payment plan | One-screen monthly plan of all planned obligations (EMIs, card bills, rent, fees…) with planned amount, due date and Paid / Due / Overdue status; per-item frequency (monthly, every N months, yearly, one-off) and variable amounts; ad-hoc items for a single month; "Pay" creates a pre-filled transaction or links an existing one; totals (planned / paid / still to pay); cash needed vs available balance per account; unpaid items carried forward as overdue; comparison with last month; **"Money owed to / by people" panel** from person ledgers (bank-loan outstanding added in Phase 3) | R2, R3, R4 (R5 for demo plan) | P0 | todo | |
| R8 | Quick-add templates | Saved one-tap entries for frequent transactions, optimised for mobile | R4 | P1 | todo | |
| R9 | Attachments & warranty flag | Attach receipt photos / PDFs (compressed, offline-capable upload queue); warranty flag with expiry date on a transaction | R4 | P1 | todo | |
| R10 | Data export | User-initiated full export to Excel / CSV / JSON; JSON re-importable into the app | R4 (R9 for attachments) | P1 | todo | |

**Suggested build order:** R1 → R2 → R3 → R4 → R5 → R6 → R7 → R8 → R9 → R10
(Demo data lands before the dashboard so charts are built and tested against realistic volumes.)

**Demo checkpoint:** after R10, the owner and testers review the demo; findings feed back into this roadmap before Phase 2a.

## Cross-cutting concerns (owned by the constitution, not by a single module)
- Offline-first on Android with sync to the backend; the sync engine is chosen in **R2's plan** and reused by all later modules.
- Per-user data isolation enforced at the database layer.
- Every change to financial records is captured in an audit history from day 1 (undo UI is Phase 4).
- Indian locale defaults (₹, lakh/crore grouping, Apr–Mar FY), with money stored as exact integer paise — never floats.
- **Public repository:** specs, plans, fixtures and examples use synthetic data only — no real banks, accounts, names or amounts.
- **Demo data grows with the product:** every module that adds a new kind of record also extends the demo dataset so the demo always exercises every feature.

## Notes
- Decisions taken at roadmap review (2026-10-10):
  - Phase 1 is a demo version on synthetic data; real-data migration moved to the final phase.
  - Invites are managed by a single owner-admin; no general role system.
  - (2026-10-11) Added **R7 Monthly payment plan** (P0) — the owner's primary monthly planning tool today (a spreadsheet of planned payments highlighted when paid). Its planned-payment items are the foundation that Phase 2b scheduled transactions, auto-posting and reminders build on; its loan-outstanding panel is filled in by Phase 3 loans. Later modules renumbered R8–R10.
  - (2026-10-11) **Person ledgers pulled into Phase 1** (R3/R4/R7): people as payees with a running owed/lent balance; "paid on behalf of" a person reduces what is owed to them (or increases what they owe) and is excluded from own spending. This same mechanism will back Phase 2b reimbursements. Bank loans with EMI schedules stay in Phase 3.
  - (2026-10-11) Added "collected on behalf of" movements, per-person interest (auto from rate or manual), and a shareable **person statement** (passbook layout: labels + signed amounts + running balance; PNG / PDF; any date range) in R6 — replaces the owner's per-person monthly spreadsheet.
  - Two environments: the **demo** environment (all of phases 1–4, synthetic data, testers) and a separate, empty **live** environment created at go-live (Phase 5), where real history starts with the wallet-app import. The demo environment stays available afterwards for trying new features. Everything must therefore be environment-configurable (no hard-coded backend URLs/keys).
- Out of scope for this roadmap (later phases per SCOPE.md): statement import & reconciliation (2a), budgets, scheduled transactions, bill reminders, credit-card cycles, reimbursement tracking, Warranty Vault view (2b), investments, loans, property (3), forecast, goals, custom reports, Google Drive backup, undo UI (4), **Ivy Wallet / MyWallet migration + historical reconciliation backlog (5, final)**, SMS capture, multi-currency.
- Open questions: none.
