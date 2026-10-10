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
| R1 | Identity, access & app shell | Invite-only sign-up (single owner-admin manages invites), Google + email/password sign-in, per-user private data, user preferences (base currency, Indian number format, date format, Apr–Mar FY), app lock (PIN / fingerprint) and hide-balances mode, on web + Android shells | — | P0 | todo | |
| R2 | Accounts & balances | Create/edit/archive accounts (bank, cash, credit card, wallet) with opening balance, grouping, colour/icon/order; live balances and net-worth summary; **first data synced offline-first** | R1 | P0 | todo | |
| R3 | Categories, tags & payees | Unlimited nested categories (seeded with sensible Indian defaults), free-form tags, payees with default category & notes; hide, merge and relocate for categories and payees | R1 | P0 | todo | |
| R4 | Transactions | Record income, expense and transfers (excluded from income/expense totals); split lines; payee, category, tags, notes, reference no., status; search, filter, bulk edit; offline entry; full edit history captured | R2, R3 | P0 | todo | |
| R5 | Demo data | Per-user "Load demo data" and "Reset / clear my data": a deterministic, synthetic Indian household with ~2 years of history across all Phase 1 account types, nested categories, payees, tags, splits and transfers — rich enough to exercise every screen and chart | R2, R3, R4 | P0 | todo | |
| R6 | Dashboard & drill-down reports | Home dashboard (net worth, this month's income/expense, safe-to-spend buffer) and interactive charts drilling category → sub-category → payee → transactions; income vs expense trend | R4 (R5 for realistic data) | P0 | todo | |
| R7 | Quick-add templates | Saved one-tap entries for frequent transactions, optimised for mobile | R4 | P1 | todo | |
| R8 | Attachments & warranty flag | Attach receipt photos / PDFs (compressed, offline-capable upload queue); warranty flag with expiry date on a transaction | R4 | P1 | todo | |
| R9 | Data export | User-initiated full export to Excel / CSV / JSON; JSON re-importable into the app | R4 (R8 for attachments) | P1 | todo | |

**Suggested build order:** R1 → R2 → R3 → R4 → R5 → R6 → R7 → R8 → R9
(Demo data lands before the dashboard so charts are built and tested against realistic volumes.)

**Demo checkpoint:** after R9, the owner and testers review the demo; findings feed back into this roadmap before Phase 2a.

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
  - Two environments: the **demo** environment (all of phases 1–4, synthetic data, testers) and a separate, empty **live** environment created at go-live (Phase 5), where real history starts with the wallet-app import. The demo environment stays available afterwards for trying new features. Everything must therefore be environment-configurable (no hard-coded backend URLs/keys).
- Out of scope for this roadmap (later phases per SCOPE.md): statement import & reconciliation (2a), budgets, scheduled transactions, bill reminders, credit-card cycles, reimbursement tracking, Warranty Vault view (2b), investments, loans, property (3), forecast, goals, custom reports, Google Drive backup, undo UI (4), **Ivy Wallet / MyWallet migration + historical reconciliation backlog (5, final)**, SMS capture, multi-currency.
- Open questions: none.
