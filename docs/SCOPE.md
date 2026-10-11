# Finance Tracker — Product Scope

_Status: scope & phasing agreed; next step = planning (architecture, data model, offline-sync choice)._

## 1. Vision
A personal finance tracker in the spirit of MS Money / Quicken / Buxfer / Mint / Money Manager Ex, built for a very small group of users (a household plus a few invited testers). **Manual entry first**; bank and credit-card statement uploads are used to **reconcile** what was entered, not as the primary data source. Focused on Indian users.

## 2. Decisions

| # | Topic | Decision |
|---|-------|----------|
| D1 | Users & data | Every user has their own login and fully private data. No sharing between users. |
| D2 | Data protection | No application-level encryption; provider at-rest encryption. Per-user isolation enforced with Supabase Row Level Security. |
| D3 | Currency | INR default. Base currency selectable at sign-up. Multi-currency deferred. |
| D4 | Region | India only. No US-specific features (no OFX/QFX/QIF, no US tax). |
| D5 | Platforms | Web app (Vercel) + cross-platform native Android app (React Native / Expo), sharing logic. |
| D6 | Statement formats | CSV, Excel (XLS/XLSX), PDF (incl. password-protected). |
| D7 | Hosting | Free tiers: Vercel (web), Supabase (Postgres + Auth + Storage). |
| D8 | Migration | Import from Ivy Wallet–based apps (e.g., MyWallet): full backup `.zip` (primary) and CSV export (fallback). **Final phase (5)** — phases 1–4 run on demo data. |
| D9 | Categorization | User-managed categories with **unlimited parent/child nesting** (reports roll up) + optional free-form tags. One category per transaction or per split line. |
| D10 | Payees | Payee list: default category, match patterns for statement text, notes, hide, merge/relocate. Same merge/relocate for categories. |
| D11 | Transaction features | Split transactions, receipt/photo attachments, payees, notes. |
| D12 | Reconciliation | Two-stage: (a) **Match & fix** — auto-match statement lines to manual entries, review unmatched both sides, one-click add/fix, mark Cleared; (b) **Balance tally** — statement opening/closing balance must agree with the account's cleared balance before finishing; entries become Reconciled & locked, session saved in history. |
| D13 | Offline | Android app supports **offline entry** with later sync (offline-first local DB + sync to Supabase). |
| D14 | Extra txn features | Quick-add templates; reimbursements & refunds linked to the original expense; user-defined custom fields; edit history / audit trail with undo; status (Unreconciled / Cleared / Reconciled / Void / Follow-up); reference / cheque no. |
| D15 | Warranty | "Warranty" flag + expiry date + attached bill/warranty card. **Warranty Vault** view (searchable, active/expired) with reminder before expiry. |
| D16 | SMS capture | Bank-SMS → draft transaction suggestions: **later phase**. |
| D17 | Account types | Bank, Cash, Credit card, Wallets, FD / RD, PPF / EPF / NPS, Mutual funds, Stocks, Gold, Property. |
| D18 | Market prices | MF / Stocks / Gold: manual **and** automatic price updates (e.g., AMFI daily NAV for mutual funds). |
| D19 | Property valuation | **Projected appreciation %** makes value grow with time; recording an **actual market valuation** re-bases it. Show projected vs actual appreciation (CAGR). |
| D20 | — | _Merged into D8._ |
| D21 | Budgets | Monthly category budgets (sub-categories roll up), optional rollover, annual budgets, alerts at 80% / 100%. |
| D22 | Reminders | Android push notifications + in-app upcoming-bills dashboard/calendar + credit-card cycle tracking (statement date, due date, min due). |
| D23 | Loans & debts | Bank loans with EMI schedule (principal/interest split, prepayment → recalculated schedule, payoff date); lent/borrowed with people; credit-card EMIs. **Cost of Debt** view: total interest across all debts per month & year, with graph of outstanding principal and cumulative interest over time. |
| D24 | Reports | **Graphical-first and interactive**: charts drill down (category → sub-category → payee → transactions) with breadcrumbs. Net worth & asset allocation, forecast & goals (incl. retirement projection), custom report builder (saved filters, export). |
| D25 | Sign-in | Google sign-in + email/password (Supabase Auth). |
| D26 | Sign-up | **Invite-only** — admin invites users by email. |
| D27 | Regional defaults | Indian number grouping (₹12,34,567.00), dd-MMM-yyyy dates, Apr–Mar financial year; changeable per user. |
| D28 | Export & backup | Full user export (Excel / CSV / JSON; JSON re-importable); scheduled auto-backup to the user's Google Drive; admin periodic DB dump. |
| D29 | Overdraft-linked home loans | Support MaxGain-style OD home loans: surplus parked in the loan account reduces the interest-bearing balance (daily interest on outstanding − surplus); show interest saved, withdrawable surplus, effective outstanding. |
| D30 | Migrated loan history | Imported loan-related rows kept under their category; a later re-map wizard links them to specific loans / people by title pattern. |
| D31 | Category mapping on import | Import wizard lets the user mark imported categories as **reimbursable** (→ Reimbursements) or ordinary. |
| D32 | Parity with Ivy-style apps | Transfers between accounts, app lock (PIN / fingerprint), hide-balances privacy toggle, safe-to-spend buffer. Transfers excluded from income/expense totals. |
| D33 | Historical reconciliation | **Backlog reconciliation mode**: set an account's opening balance from its earliest statement, then work statement-by-statement carrying the closing balance forward, with bulk add/fix of missing or wrong historic entries. |
| D34 | Demo-first delivery | Phase 1 is a demo version on synthetic data for owner/tester evaluation; real-data migration is the final phase. Every module extends the demo dataset. Invites managed by a single owner-admin. |
| D35 | Environments | **Demo** environment (synthetic data, testers; used for phases 1–4 and kept afterwards) and a separate, empty **live** environment created at go-live, where real history begins with the wallet-app import. Real statements may be trial-uploaded in demo; they are not carried over. All config is per-environment (separate backend project, web deployment and Android build profile). |
| D36 | Monthly payment plan | One-screen monthly plan of all planned obligations with planned amount, due date and Paid / Due / Overdue status; per-item frequency (monthly, every N months, yearly, one-off) and variable amounts; ad-hoc single-month items; "Pay" creates a pre-filled transaction or links an existing one (never recorded twice); totals planned / paid / still to pay; cash needed vs available per account; unpaid items carried forward as overdue; month-vs-last-month comparison; outstanding-loans panel (filled by Phase 3 loans). **Phase 1** — Phase 2b scheduling & reminders build on its planned items. |
| D37 | Person ledgers | Payees are businesses or **people**. A person payee has a running ledger balance ("I owe them" / "they owe me") with an opening balance. Movements: borrowed from / lent to, repaid / received back, and **paid on behalf of** the person — which adjusts their balance and is **excluded from the user's own spending** (shown as a settlement). Monthly payment plan shows a "money owed to / by people" panel. **Phase 1**; Phase 2b reimbursements reuse this mechanism; bank loans with EMI schedules remain Phase 3. |
| D38 | Person statements | Extends D37 with **collected on behalf of** a person (e.g., rent received for them; increases what is owed to them, not the user's income) and **interest on person loans**, configured per person: auto-accrued at month-end from a monthly rate applied to the **month's opening balance** (accrued interest is added to the balance, so it compounds monthly; movements during the month do not change that month's interest; overridable) or entered manually, rounded to exact paise. A **person statement** for any date range shows opening balance, each movement with a plain-language type, signed amount and running balance, and closing balance ("You owe X" / "X owes you"); sign direction is a per-person setting. Shareable as **PNG image** (Android share sheet, e.g. messaging apps) and **PDF**. **Phase 1** (R4 movements, R6 statement). |
| D39 | Interest rates | Every interest-bearing balance (person loans, bank loans, overdraft / MaxGain-style accounts) has an **effective-dated rate history** ("x% from date"); past interest is never recomputed when a rate changes. Rates may be any value **including 0%**. Person loans: rate changes take effect **only from the 1st of a month** (no mid-month changes); interest = that month's rate × the month's opening balance. Bank overdrafts: daily interest on (outstanding − parked surplus) using the rate in force each day; the **bank's actual interest debit (from the statement) is the source of truth** — the app's figure estimates, verifies and forecasts it. Person-loan rates in Phase 1; bank loans/OD in Phase 3. |

## 3. Phasing

**Phase 1 — Demo version (synthetic demo data)**
Invite-only auth (single owner-admin) · accounts (bank, cash, credit card, wallet) · nested categories + tags · payees · transactions (splits, transfers, notes, receipt attachments, status, reference no., warranty flag) · quick-add templates · offline-first Android + web · **load / reset demo data** · dashboard + drill-down spending/income charts · **monthly payment plan** · app lock, hide balances, safe-to-spend · full export · audit trail captured from day 1. Ends with a demo review whose findings may add or change features. Detailed module breakdown: [ROADMAP.md](../ROADMAP.md).

**Phase 2a — Statement import & backlog reconciliation**
Bank-account statement import (CSV / Excel) with per-bank presets · Match & fix + balance-tally reconciliation · backlog mode · credit-card PDF statements (password-protected) · payee match patterns & rules

**Phase 2b — Plan**
Budgets with rollover & alerts · scheduled transactions (auto-post) & bill calendar built on the Phase 1 payment plan · credit-card cycles · push notifications · reimbursements & refunds · Warranty Vault

**Phase 3 — Wealth & debt**
FD / RD · PPF / EPF / NPS · MF / stocks / gold with prices · property valuation · bank & OD loans with EMI schedule · lent / borrowed · card EMIs · Cost of Debt · net worth & asset allocation

**Phase 4 — Insight & polish**
Forecast · goals · retirement projection · custom report builder · custom fields · undo UI · Google Drive auto-backup · admin DB backup automation

**Phase 5 — Go-live: migration (final)**
Create the empty live environment · Ivy Wallet / MyWallet import (backup `.zip` primary, CSV fallback) incl. planned payments → schedules, reimbursable-category mapping, loan-history re-map · historical backlog reconciliation against real statements. The existing wallet app stays in daily use until this phase; imports are idempotent so the latest export can be re-imported at cut-over.

**Later** — Bank-SMS draft capture · multi-currency

> Principle: phases 1–4 are built and validated on synthetic demo data; every module extends the demo dataset for the records it introduces.

## 4. Known risks / constraints
- **Supabase free tier**: 500 MB DB, 1 GB file storage (compress receipt images client-side); projects pause after ~7 days of inactivity.
- **Offline-first sync** (Expo + Supabase) is the biggest technical piece — evaluate PowerSync / WatermelonDB / custom sync.
- **PDF statements** differ per bank and are often password-protected → bank-specific parsers; password entered at upload, never stored.
- **Free stock & gold price sources** are limited/unofficial (AMFI NAV for MFs is reliable).
- Google Play restricts SMS permission → SMS feature implies direct APK distribution.

## 5. Ivy Wallet import format (reference)

**CSV export**
- Encoding **UTF-16 LE with BOM**, comma-separated, quoted fields.
- Columns: `Date, Title, Category, Account, Amount, Currency, Type, Transfer Amount, Transfer Currency, To Account, Receive Amount, Receive Currency, Description, Due Date, ID`.
- `Date`: local ISO timestamp, no timezone, 0–3 fractional-second digits.
- `Amount`: positive, thousands separators, quoted (`"1,562.00"`); sign from `Type` (`EXPENSE` | `INCOME` | `TRANSFER`). For transfers `Amount` is `0.00` — the value is in `Transfer Amount` / `Receive Amount`.
- `ID`: UUID → idempotency key for re-imports.
- Rows with `Due Date` and empty `Date` are planned (unpaid) payments → import as scheduled items, not posted transactions.

**Full backup (.zip)**
- One `data<digits>.json`, encoded **UTF-16 BE with BOM**.
- Keys: `accounts`, `categories`, `transactions`, `plannedPaymentRules`, `settings`, `sharedPrefs`.
- Timestamps are epoch milliseconds UTC (`dateTime`, `dueDate`, `paidForDateTime`, `startDate`).
- Accounts: `name, currency, color (ARGB int), icon, orderNum` — no type, no opening balance (Ivy derives balances from transactions).
- Categories: `name, color, icon, orderNum` — flat.
- `plannedPaymentRules`: `title, type, amount, accountId, categoryId, startDate, intervalN, intervalType, oneTime`; transactions link via `recurringRuleId`.
- `settings`: `currency`, `bufferAmount`, `theme`; `sharedPrefs`: `transfers_as_inc_exp`, `show_notifications`, `hide_current_balance`, `lock_app`.
- Not present: budgets, loans, opening balances, account types, category hierarchy.

**Import wizard**: upload → map account types → balance check (derived vs actual, create opening adjustment) → optional category nesting, reimbursable flags & payee grouping → preview → import (idempotent).

| Ivy | App |
|-----|-----|
| Account | Account (type chosen in wizard) |
| Category | Category (flat; nest later) |
| Title | Payee suggestion + memo |
| EXPENSE / INCOME | Transaction (sign from type) |
| TRANSFER | Transfer between accounts |
| `Reconciliation`-type category | Balance adjustment |
| Due Date rows / `plannedPaymentRules` | Scheduled transactions |
| color / icon / orderNum | Colour, closest icon, sort order |
| Description | Notes |
| ID | External ID (dedupe key) |
