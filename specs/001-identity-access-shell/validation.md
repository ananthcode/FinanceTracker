# Validation record — R1 Identity, Access & App Shell

Run on 2026-10-24, local stack (Supabase CLI 2.120, Next.js 16.4 dev server), branch
`001-identity-access-shell`. Build order per owner decision: **web first**; Android-only items are
deferred and listed below as open.

## Automated suites

| Suite | Command | Result |
|-------|---------|--------|
| Database access rules (pgTAP) | `pnpm db:test` | 6 files, 82 tests — PASS |
| Web integration | `pnpm --filter @ft/web test:int` | 3 files, 16 tests — PASS |
| Unit (core, db, web, mobile components), typecheck, lint | `pnpm test`, `pnpm typecheck`, `pnpm lint` | all packages PASS (mobile: 9 tests) |
| Web end-to-end (Playwright) | `pnpm e2e` | 30 tests — PASS |

## Quickstart scenarios

| ID | Evidence | Result |
|----|----------|--------|
| S1-a…S1-e | `us1-invitations.spec.ts`, `route.int.test.ts` | PASS |
| S2-a…S2-e, SEC-a | `us2-sign-in.spec.ts`, `lockout.test.sql` | PASS |
| S3-a…S3-c | `us3-preferences.spec.ts`, `preferences.test.sql` | PASS (web) |
| S4-a…S4-e, SEC-d | `us4-admin.spec.ts`, `admin.test.sql` | PASS (web) |
| S5-a | `us5-shell.spec.ts` (web), `shell.test.tsx` (Android components) | PASS (web); Android on device — open |
| S5-b | `shell.test.tsx` (debounce logic) | Logic PASS; airplane-mode check on emulator — open |
| S7-a | `us7-hide-balances.spec.ts`, `Money.test.tsx` | PASS (web); Android toggle — deferred (T117) |
| SC-006 | `us7-hide-balances.spec.ts` (no unmasked amount on screen) | PASS |
| SC-008 | `audit-coverage.spec.ts` (16 actions), `invitations.int.test.ts` (`invitation_delivery_failed`), `admin.test.sql` (`owner_recovered`) | 18 of 20 PASS; `app_lock_enabled/disabled` arrive with US6 |
| SC-009 | `us4-admin.spec.ts` erase test, `admin.test.sql` | PASS |
| Accessibility (Principle XIII) | `a11y.spec.ts` — axe WCAG 2.1 AA + keyboard-only | PASS (web) |
| Backend unreachable | `proxy.test.ts`, `shell.test.tsx` | PASS |

## Open (not yet validated)

| Item | Why open | When |
|------|----------|------|
| US6 Android app lock (S6-a…S6-c, SEC-c), T105–T113 | Deferred — web-first order | Android phase |
| S5-a/S5-b on the Android emulator | Deferred — web-first order | Android phase |
| PERF-a (SC-004) on a physical Android device | Needs the owner's phone | Android phase |
| Google sign-in end to end | Needs a Google OAuth client (owner account) | Hosted demo setup (T123) |
| Hosted demo environment (T123) | Owner-assisted: Supabase, Vercel, SMTP, Google OAuth | After R1 merge |
