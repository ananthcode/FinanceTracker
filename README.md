# Finance Tracker

A personal finance tracker for web and Android, inspired by MS Money, Quicken, Buxfer and Money Manager Ex — built for India (₹, lakh/crore formatting, Apr–Mar financial year).

**Manual entry first.** Bank and credit-card statements (CSV / Excel / PDF) are uploaded to **reconcile** what you entered, Quicken-style: auto-match, fix the gaps, then tally against the statement's closing balance.

> 🚧 Status: building **R1 — identity, access & app shell** (invite-only sign-in, owner-admin user
> management, regional preferences, navigation shell, hide-balances). Money features start with R2.
> Scope: [docs/SCOPE.md](docs/SCOPE.md) · Roadmap: [ROADMAP.md](ROADMAP.md) · Current spec:
> [specs/001-identity-access-shell](specs/001-identity-access-shell/spec.md)

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

## Stack

| Layer | Choice |
|-------|--------|
| Web | Next.js 16 (App Router), React 19, Tailwind 4 — hosted on Vercel |
| Android | React Native with Expo (development build, Expo Router) |
| Backend | Supabase — Postgres with Row Level Security, Auth, Storage |
| Shared | TypeScript; `packages/core` (Zod schemas, money/date formatting), `packages/db` (data access) |
| Repo | pnpm workspaces + Turborepo monorepo |

```
apps/web       Next.js web app and the HTTP API used by Android
apps/mobile    Expo Android app
packages/core  Domain logic and schemas shared by both apps
packages/db    Supabase clients and repositories
supabase/      Migrations and pgTAP database tests
scripts/       Environment bootstrap and owner recovery
specs/         Spec Kit artefacts per feature (spec, plan, tasks, contracts, quickstart)
```

## Developer setup

Prerequisites: Node.js 24, pnpm 10 (`corepack enable`), Docker Desktop. Android work also needs
Android Studio (SDK + emulator) and JDK 17.

```bash
pnpm install
```

```bash
pnpm db:start
```

```bash
pnpm db:reset
```

Copy `.env.example` to `apps/web/.env.local` (and `apps/mobile/.env.local` for Android), fill in
the local keys printed by `pnpm db:start`, then create the owner-admin invitation and start the web
app:

```bash
pnpm env:bootstrap
```

```bash
pnpm dev
```

The web app runs at http://localhost:3000; emails (invitations, password resets) land in the
local Mailpit inbox at http://localhost:54324. Full steps, Windows notes and the manual validation
checklist: [quickstart.md](specs/001-identity-access-shell/quickstart.md).

### Checks

```bash
pnpm lint
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm db:test
```

```bash
pnpm e2e
```

CI runs the same checks on every push. A daily workflow keeps the hosted demo backend from pausing
on the Supabase free tier.

## Privacy

This repository contains **no real financial data**. Test fixtures are synthetic. Real statements, exports and personal notes are git-ignored and never leave the developer's machine.

## License

TBD
