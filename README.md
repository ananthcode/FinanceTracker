# Finance Tracker

A personal finance tracker for web and Android, inspired by MS Money, Quicken, Buxfer and Money Manager Ex — built for India (₹, lakh/crore formatting, Apr–Mar financial year).

**Manual entry first.** Bank and credit-card statements (CSV / Excel / PDF) are uploaded to **reconcile** what you entered, Quicken-style: auto-match, fix the gaps, then tally against the statement's closing balance.

> 🚧 Status: scoping complete, planning in progress. See [docs/SCOPE.md](docs/SCOPE.md).

## Planned features

- **Transactions** — splits, transfers, payees, nested categories + tags, receipt photos, quick-add templates, audit trail
- **Reconciliation** — statement import with match & fix, balance tally, backlog mode for historic data
- **Budgets** — monthly & annual category budgets with rollover and alerts
- **Bills** — scheduled transactions, bill calendar, credit-card cycles, push reminders
- **Wealth** — FD/RD, PPF/EPF/NPS, mutual funds, stocks, gold, property with projected vs actual appreciation
- **Debt** — EMI schedules, overdraft-linked (MaxGain-style) home loans, lent/borrowed, Cost of Debt view
- **Reports** — interactive, drill-down charts; net worth, asset allocation, forecast, goals
- **Warranty Vault** — find any bill or warranty card in two taps
- **Offline-first Android app** with sync, app lock and hide-balances mode
- **Migration** from Ivy Wallet–based apps (backup `.zip` or CSV)

## Planned stack

| Layer | Choice |
|-------|--------|
| Web | Next.js on Vercel |
| Android | React Native (Expo) |
| Backend | Supabase — Postgres, Auth, Storage, Row Level Security |
| Repo | pnpm workspaces + Turborepo monorepo |

## Privacy

This repository contains **no real financial data**. Test fixtures are synthetic. Real statements, exports and personal notes are git-ignored and never leave the developer's machine.

## License

TBD
