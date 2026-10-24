# Implementation Plan: Identity, Access & App Shell

**Branch**: `001-identity-access-shell` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-identity-access-shell/spec.md`

## Summary

Build the project skeleton (pnpm + Turborepo monorepo: Next.js web app, Expo Android app, shared
`core`/`db`/`config` packages, Supabase migrations and tests, CI) and on it the identity layer:
invite-only access enforced inside Supabase Auth by a *Before User Created* hook over our own
`invitations` table; Google + email/password sign-in; a server endpoint for password sign-in with
per-email lockout; owner-admin invitation and user management (disable, re-enable, erase with dual
confirmation) through service-role route handlers; per-user preferences with India-first defaults;
an append-only audit trail; Android app lock (PIN hash in SecureStore + biometrics, recent-apps preview hidden while screenshots
stay allowed);
per-device hide-balances through one `<Money>` primitive; and the signed-in navigation shell with
demo marker and offline indicator. Decisions and sources: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 24 LTS; SQL (PostgreSQL 15+, Supabase)

**Primary Dependencies**: Next.js 16 (App Router) + React 19, Tailwind CSS 4 + shadcn/ui;
Expo SDK 57 + expo-router, NativeWind, expo-secure-store, expo-local-authentication,
a small Expo config plugin for `setRecentsScreenshotEnabled` (Android 13+), @react-native-community/netinfo; supabase-js 2 + @supabase/ssr; Zod 4;
TanStack Query; react-hook-form; nodemailer (SMTP); Turborepo 2, pnpm 10

**Storage**: Supabase Postgres (RLS, Auth hooks); on-device: SecureStore (session, PIN hash,
lock settings), AsyncStorage / localStorage (hide-balances). No Supabase Storage in R1.

**Testing**: Vitest (core, db, web units); pgTAP via `supabase test db` (RLS, hooks, triggers,
audit); Playwright (web E2E, stories 1–4, Mailpit for emails); Jest + React Native Testing
Library (mobile units); GitHub Actions CI

**Target Platform**: Web (evergreen desktop + mobile browsers) on Vercel Hobby; Android 10+
(API 29+) via EAS-built APK; Supabase Free (2 projects: demo, live)

**Project Type**: Monorepo — web app + Android app + shared packages + database

**Performance Goals**: Signed-in Android home in < 3 s from launch, < 2 s after fingerprint unlock
(SC-004); preference changes re-render immediately (SC-005); disable/revoke effective < 1 min
(SC-007)

**Constraints**: Free tiers only (Principle XI); < 20 users per environment; no secrets or backend
URLs in source; service-role key server-side only; no real data in fixtures; Android must open
offline with a cached session; the R2 offline-sync engine must remain pluggable

**Scale/Scope**: ~12 web routes, ~12 mobile screens, 4 public tables + 3 private, 2 Auth hooks,
~16 HTTP endpoints, 7 user stories

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Per-user isolation | PASS | RLS default-deny on all user tables, `app.is_active_user()` in every policy; owner sees only `admin_list_users()` columns; erase never returns data; pgTAP rules 1–6 (contracts/database.md) |
| II | Money correctness | PASS | No stored money in R1; `formatMoney` takes `bigint` minor units, tested for zero/negative/large/lakh-crore; no floats |
| III | Auditable records | PASS | Append-only `audit_events`; generic `capture_change` trigger established; erasure scrub only via III(b) path |
| IV | Offline-first mobile | PASS (scoped) | R1 has no offline-created records; app opens offline with cached session; UUID keys; repository interface leaves sync engine to R2 |
| V | No real data in repo | PASS | `example.com` fixtures; Mailpit locally; guard-data CI kept |
| VI | Secrets & environments | PASS | `.env.example`; demo/live separate projects; service role only in route handlers; `APP_ENV` marker |
| VII | Shared core, thin clients | PASS | Formatting, FY, masking, password policy, Zod contracts in `packages/core`; Supabase access in `packages/db` |
| VIII | Validate at boundaries | PASS | Zod on every endpoint and form; DB checks (citext, enums, ranges, currency lock trigger) |
| IX | Testing discipline | PASS | Vitest edge cases, pgTAP isolation incl. owner, Playwright stories 1–4, RNTL lock logic; CI on every push |
| X | Demo-first | PASS | Built against local stack + demo project; R1 adds no record types needing demo data (R5) |
| XI | Simplicity & free tier | PASS w/ note | Free plan features only (verified, research R-01/R-05); SMTP via free provider; one justified addition in Complexity Tracking |
| XII | India-first locale | PASS | Defaults INR / Indian grouping / dd-MMM-yyyy / April FY / Asia/Kolkata; UTC timestamps |
| XIII | Accessible graphical UX | PASS | Single `<Money>` per app + lint rule; masking never reveals digit count; status shown with text, not colour only |
| Tech | Technology constraints | PASS | TS strict, pnpm + Turborepo, Next.js/Vercel, Expo/EAS, Supabase, SQL migrations only; sync engine deferred to R2 |
| Flow | Workflow & gates | PASS | Feature branch; spec approved; plan gate next; AI code reviewed; auth/RLS/sync changes flagged for explicit review |

**Post-design re-check (after Phase 1)**: PASS — data-model and contracts introduce no new
violations. Items flagged for explicit owner review at implementation (constitution workflow):
Auth hooks, RLS policies, erase flow, sign-in endpoint, PIN storage.

## Project Structure

### Documentation (this feature)

```text
specs/001-identity-access-shell/
├── plan.md              # This file
├── research.md          # Phase 0 decisions (R-01 … R-17)
├── data-model.md        # Phase 1 tables, RLS, state transitions
├── quickstart.md        # Phase 1 run & validation guide
├── contracts/
│   ├── http-api.md      # Server endpoints (public, user, owner)
│   ├── database.md      # Hooks, triggers, RPCs, access rules to prove
│   └── client-shell.md  # Routes, shell elements, shared primitives, env keys
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
apps/
├── web/                          # Next.js App Router (Vercel)
│   ├── app/
│   │   ├── (public)/sign-in, forgot-password, reset-password, invite/[token]
│   │   ├── (app)/layout.tsx      # signed-in shell: nav, hide-balances, demo marker
│   │   ├── (app)/page.tsx, accounts/, transactions/, payment-plan/, settings/, setup/
│   │   ├── (app)/admin/          # owner only
│   │   ├── api/                  # route handlers per contracts/http-api.md
│   │   └── .well-known/assetlinks.json/route.ts
│   ├── components/ (Money.tsx, DateText.tsx, shell/, ui/ ← shadcn)
│   ├── lib/ (supabase server/browser clients, auth guards, mailer, session-idle)
│   ├── middleware.ts             # session refresh + 30-min idle rule
│   └── e2e/                      # Playwright specs per story
└── mobile/                       # Expo + expo-router (Android)
    ├── app/ (sign-in, invite/[token], setup, lock, (tabs)/…, settings)
    ├── components/ (Money.tsx, DateText.tsx, OfflineBanner, DemoBadge)
    ├── lib/ (supabase client w/ SecureStore adapter, api client, app-lock, netinfo)
    ├── app.config.ts             # profiles demo/live, App Links intent filters
    ├── eas.json
    └── __tests__/

packages/
├── core/                         # framework-agnostic domain (no React, no Supabase)
│   ├── src/money/ (formatMoney, maskMoney)
│   ├── src/dates/ (formatDate, fiscalYearOf, timezones)
│   ├── src/auth/ (passwordPolicy, common-passwords list)
│   ├── src/schemas/ (Zod request/response contracts)
│   └── test/
├── db/                           # Supabase client factories, generated types, repositories
│   ├── src/types.gen.ts
│   ├── src/repositories/ (profile, preferences, admin)
│   └── test/
└── config/                       # shared tsconfig, eslint, tailwind preset

supabase/
├── config.toml                   # local stack, hooks wired for local
├── migrations/                   # versioned SQL (types, tables, RLS, hooks, triggers, functions)
├── seed.sql                      # local-only synthetic seed
└── tests/                        # pgTAP: rls_isolation, hooks, audit, preferences

scripts/
└── env-bootstrap.ts              # invite OWNER_EMAIL as owner (FR-013)

.github/workflows/
├── guard-data.yml                # existing
├── ci.yml                        # lint, typecheck, unit, db tests, e2e
└── keep-alive.yml                # daily demo health ping

.env.example
pnpm-workspace.yaml, turbo.json, package.json
```

**Structure Decision**: Monorepo with two apps (`apps/web`, `apps/mobile`), three shared packages
(`packages/core` domain logic, `packages/db` data access, `packages/config` tooling presets), and
`supabase/` for schema, hooks and policy tests. Privileged operations live in `apps/web/app/api`
(research R-07). This layout is the template every later roadmap module extends.

## Complexity Tracking

> Additions beyond the simplest design, justified per Principle XI.

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| Own password sign-in endpoint + `private.sign_in_attempts` | FR-009 per-email lockout | Supabase's native Password Verification hook is Team/Enterprise only; per-IP limits don't meet the requirement |
| Own invitation table + emails (instead of `inviteUserByEmail`) | 7-day expiry, revoke/resend, Google path (FR-003/004) | Built-in invites pre-create users and cap link lifetime at 24 h |
| Bundled common-password list | FR-007 | Supabase leaked-password protection is Pro-only |
| `private.rate_limits` counters | FR-008a abuse limits on public endpoints | A KV/Redis service adds an account and dependency; Postgres suffices at < 20 users |
| Daily keep-alive workflow | Demo project must not pause during testing | Free projects pause after 7 days of low activity; upgrading is paid |
