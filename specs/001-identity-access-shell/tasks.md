---

description: "Task list for R1 — Identity, Access & App Shell"
---

# Tasks: Identity, Access & App Shell

**Input**: Design documents from `/specs/001-identity-access-shell/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (http-api.md,
database.md, client-shell.md), quickstart.md

**Tests**: Included — required by constitution Principle IX and spec SC-002, SC-003, SC-008,
SC-009. Within each story, write the listed tests first and see them fail before implementing.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested
independently. R1 is the first module, so Setup and Foundational also create the project skeleton.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story from spec.md (US1–US7)
- Migration file names use the prefix `YYYYMMDDHHMMSS_`; use the timestamp at creation time
  (shown here as `<ts>`), keeping the listed order.

## Path Conventions (from plan.md)

`apps/web` (Next.js) · `apps/mobile` (Expo) · `packages/core` · `packages/db` · `packages/config` ·
`supabase/` (migrations, tests, config) · `scripts/` · `.github/workflows/`

**Mobile path mapping (decided at implementation, 2026-10-13)**: the Expo SDK 57 template keeps
sources under `src/` with the `@/*` alias. Task paths `apps/mobile/app/…`, `apps/mobile/lib/…` and
`apps/mobile/components/…` therefore live at `apps/mobile/src/app/…`, `apps/mobile/src/lib/…` and
`apps/mobile/src/components/…`; tests at `apps/mobile/src/__tests__/…`.

**Web path mapping (Next.js 16)**: the `middleware.ts` convention is renamed to `proxy.ts` in Next.js 16
(Node.js runtime; `params`, `cookies()`, `headers()` are async). Tasks T036 and T069 therefore use
`apps/web/proxy.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo, tooling, local backend and CI skeleton

- [X] T001 Create root workspace files `package.json` (scripts: dev, build, lint, typecheck, test, db:reset, db:test, db:types, e2e, env:bootstrap, env:recover-owner), `pnpm-workspace.yaml` (apps/*, packages/*), `turbo.json`, `.nvmrc` (Node 24 LTS), `.npmrc`
- [X] T002 [P] Create shared tooling package `packages/config/` with `tsconfig.base.json` (strict: true, noUncheckedIndexedAccess), `eslint.config.mjs` (flat config) and `tailwind-preset.cjs` (shared design tokens; CommonJS so both Tailwind 4 web and NativeWind/Tailwind 3 mobile can load it)
- [X] T003 [P] Create `.env.example` with every key from contracts/client-shell.md §Configuration (placeholder values only; `SUPABASE_SERVICE_ROLE_KEY` marked server-only)
- [X] T004 Scaffold Next.js 16 App Router app in `apps/web/` (TypeScript, Tailwind CSS 4 using `packages/config/tailwind-preset.cjs`, `npx shadcn init`, TanStack Query, react-hook-form + Zod resolver), extending `packages/config/tsconfig.base.json`
- [X] T005 Scaffold Expo SDK 57 app with expo-router in `apps/mobile/` (NativeWind with the shared preset, TanStack Query, react-hook-form + Zod resolver), `apps/mobile/app.config.ts` reading `APP_ENV`, and `apps/mobile/eas.json` with build profiles `demo` and `live` using different Android application IDs
- [X] T006 [P] Create `packages/core/` (package.json, `src/index.ts`, `vitest.config.ts`) — no React or Supabase imports allowed
- [X] T007 [P] Create `packages/db/` (package.json, `src/index.ts`, `vitest.config.ts`) depending on `@supabase/supabase-js` and `@supabase/ssr`
- [X] T008 Initialise Supabase local stack in `supabase/config.toml`: auth minimum password length 8, recovery/OTP expiry 3600 s, Google provider (env placeholders), local SMTP → Mailpit, Auth hooks pointing at `app.hook_before_user_created` and `app.hook_custom_access_token`
- [X] T009 [P] Configure Playwright in `apps/web/playwright.config.ts` with a Mailpit helper `apps/web/e2e/helpers/mailpit.ts` (read latest email for an address)
- [X] T010 [P] Configure Jest + React Native Testing Library in `apps/mobile/jest.config.js` and `apps/mobile/jest.setup.ts`
- [X] T011 [P] Add ESLint rule in `packages/config/eslint.config.mjs` forbidding imports of `formatMoney`/`formatDate` from `@ft/core` in `apps/**` except `components/Money.tsx` and `components/DateText.tsx` (research R-11)
- [X] T012 [P] Create CI workflow `.github/workflows/ci.yml`: pnpm install, lint, typecheck, unit tests, `supabase start` + `pnpm db:test`, Playwright e2e — alongside existing `guard-data.yml`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, access rules, shared domain code, clients and app frames every story needs

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database foundation

- [X] T013 Create migration `supabase/migrations/<ts>_foundation.sql`: extensions `citext`, `pgcrypto`; schemas `app`, `audit`, `private` (no grants on `private` to `anon`/`authenticated`); revoke default execute on new functions from `public`
- [X] T014 Create migration `supabase/migrations/<ts>_enums.sql`: `user_role` (`owner`, `member`); `access_status` (`active`, `disabled`); `invitation_status` (`pending`, `accepted`, `revoked`, `superseded`); `number_format` (`indian`, `international`); `date_format` (`dd-MMM-yyyy`, `dd/MM/yyyy`, `yyyy-MM-dd`); `audit_action` with the 20 actions listed in data-model.md §Audit Event
- [X] T015 Create migration `supabase/migrations/<ts>_profiles.sql`: `public.profiles` — `user_id` uuid PK FK `auth.users(id)` ON DELETE CASCADE; `email` citext NOT NULL UNIQUE; `display_name` text NULL, "1–50 chars after trim" check; `role` default `member`; partial unique index `WHERE role = 'owner'`; `status` default `active`; `setup_completed_at`, `last_sign_in_at`, `privacy_notice_shown_at` timestamptz; `created_at`/`updated_at` default `now()`; RLS enabled, no policies yet
- [X] T016 Create migration `supabase/migrations/<ts>_user_preferences.sql`: `public.user_preferences` — `user_id` PK FK ON DELETE CASCADE; `base_currency` char(3) NOT NULL default `INR` with ISO 4217 check; `number_format` default `indian`; `date_format` default `dd-MMM-yyyy`; `fy_start_month` smallint 1–12 default 4; `timezone` text default `Asia/Kolkata` validated against `pg_timezone_names`; `updated_at`; trigger `lock_base_currency` rejecting `base_currency` change once `profiles.setup_completed_at` is set; RLS enabled
- [X] T017 Create migration `supabase/migrations/<ts>_invitations.sql`: `public.invitations` — `id` uuid PK; `email` citext NOT NULL; `role` default `member`; `token_hash` bytea UNIQUE (raw token never stored); `status` default `pending`; `invited_by` FK ON DELETE SET NULL; `created_at`; `expires_at` = `created_at + 7 days`; `accepted_at`, `revoked_at`; `accepted_user_id` FK ON DELETE SET NULL; `superseded_by` FK `invitations(id)`; `delivery_status` (`sent`, `failed`); partial unique index one `pending` row per `email`; RLS enabled with **no** client policies
- [X] T018 Create migration `supabase/migrations/<ts>_private_tables.sql`: `private.sign_in_attempts` (`email` citext PK, `failed_count` int, `first_failed_at`, `locked_until`); `private.rate_limits` (`bucket` text PK — SHA-256 keys only, `window_start`, `count`) with `app.rate_limit_hit(bucket text, window_seconds int, max int) returns boolean`; `private.environment` single row (`name` `demo`|`live`)
- [X] T019 Create migration `supabase/migrations/<ts>_audit.sql`: `public.audit_events` per data-model.md (no UPDATE/DELETE grants or policies for any client role); `app.write_audit(...)` SECURITY DEFINER with pinned `search_path`; generic `audit.capture_change()` trigger storing before/after JSON (never copies token columns); SELECT policy: own `sign_in_*`/`signed_out` events only
- [X] T020 Create migration `supabase/migrations/<ts>_access_rules.sql`: `app.is_active_user()`; RLS on `profiles` (select/update own row, active only; `role`/`status` not client-updatable via column grants) and `user_preferences` (select/update own row, active only); `capture_change` trigger on `user_preferences` UPDATE; `app.health()` returning `{status:'ok', environment}` executable by `anon`
- [X] T021 Create migration `supabase/migrations/<ts>_on_auth_user_created.sql`: AFTER INSERT trigger on `auth.users` → insert `profiles` (role from the pending invitation) and default `user_preferences`, mark invitation `accepted` (`accepted_at`, `accepted_user_id`), write `invitation_accepted`
- [X] T022 Create migration `supabase/migrations/<ts>_auth_hooks.sql`: `app.hook_before_user_created(event jsonb)` — allow only with a `pending`, unexpired invitation for the email (case-insensitive) and, for Google identities, a verified email; otherwise error `INVITE_REQUIRED`; `app.hook_custom_access_token(event jsonb)` — refuse when profile `disabled`, email locked in `private.sign_in_attempts`, or (for a Google sign-in) the Google identity's email no longer matches the user's email case-insensitively or is not verified (FR-004, every later Google sign-in); add claim `app_role`; grant execute only to `supabase_auth_admin`
- [X] T023 Create pgTAP helpers `supabase/tests/00_helpers.sql` (create test users, impersonate `authenticated` with a given `sub`, reset state)
- [X] T024 Write pgTAP isolation suite `supabase/tests/rls_isolation.test.sql` covering contracts/database.md rules 1–6 and 11 (user A vs B vs owner; disabled user gets zero rows; no client access to `invitations`/`private.*`; `audit_events` not updatable/deletable)
- [X] T025 Add `pnpm db:types` generating `packages/db/src/types.gen.ts` from the local schema; commit generated types

### Shared domain code (packages/core)

- [X] T026 [P] Write tests then implement `formatMoney(minor: bigint, currency, prefs)` and `maskMoney(currency)` in `packages/core/src/money/format.ts` + `packages/core/test/money.test.ts` (zero, negative, very large, `₹12,34,567.00` Indian vs `₹1,234,567.00` international, mask always `₹••••`, no floating point)
- [X] T027 [P] Write tests then implement `formatDate`, `fiscalYearOf(date, startMonth)`, `isValidTimezone` in `packages/core/src/dates/` + `packages/core/test/dates.test.ts` (all three date formats, Apr–Mar boundary on 31-Mar/01-Apr, UTC vs Asia/Kolkata midnight)
- [X] T028 [P] Write tests then implement `passwordPolicy` in `packages/core/src/auth/password-policy.ts` with a bundled list `packages/core/src/auth/common-passwords-10k.ts` (published 10,000-entry SecLists list, MIT licence noted in file header; stored as a TypeScript module so web, server and Android bundlers can all import it): min 8 chars, reject list entries case-insensitively, reject the email local part (FR-007)
- [X] T029 [P] Implement Zod contracts for every request/response and error code in contracts/http-api.md in `packages/core/src/schemas/` (`InvitationLookup`, `AcceptInvitationRequest`, `PasswordSignInRequest`, `SessionResponse`, `SetupRequest`, `MeResponse`, `PreferencesUpdate`, admin schemas, `ErrorResponse`)
- [X] T030 Implement client factories in `packages/db/src/clients.ts`: browser, server (cookie adapter via `@supabase/ssr`), service-role (throws if imported in a browser bundle), mobile (accepts a storage adapter)

### Web foundation (apps/web)

- [X] T031 [P] Implement env loading + validation in `apps/web/lib/env.ts` (Zod; `APP_ENV`, public vs server-only keys; reject any Supabase/web base URL that is not `https://` unless the host is `localhost`/`127.0.0.1` — FR-036a) and environment guard calling `app.health()` that renders `apps/web/app/config-error/page.tsx` on mismatch (FR-019a)
- [X] T032 [P] Implement Supabase helpers `apps/web/lib/supabase/server.ts`, `browser.ts`, `admin.ts` (`import 'server-only'` in admin) using `packages/db`
- [X] T033 Implement route wrapper `apps/web/lib/api/handler.ts`: Zod body/params validation, error shape `{error:{code,message}}` with `errorId`, auth from cookies or `Authorization: Bearer`, `401 USER_INACTIVE` for disabled callers, owner guard helper, `Origin` check against `WEB_BASE_URL` for cookie-authenticated mutations (FR-036b), redacting logger (FR-036d)
- [X] T034 [P] Write tests `apps/web/lib/api/handler.test.ts` proving logs contain no emails, tokens or passwords and errors carry `errorId`
- [X] T035 [P] Implement rate limiter `apps/web/lib/rate-limit.ts` (SHA-256 bucket keys, calls `app.rate_limit_hit`) and mailer `apps/web/lib/mailer.ts` (nodemailer SMTP from env; returns `sent`/`failed`)
- [X] T036 Implement `apps/web/middleware.ts`: session refresh via `@supabase/ssr`, unauthenticated → `/sign-in`, setup incomplete → `/setup`, non-owner → 403 for `/admin`
- [X] T037 Create minimal signed-in frame `apps/web/app/(app)/layout.tsx` and placeholder `apps/web/app/(app)/setup/page.tsx` (completed in US3)
- [X] T038 Implement per-device `HideBalancesProvider` (localStorage, default off) and the only amount renderer `apps/web/components/Money.tsx` using `formatMoney`/`maskMoney`; `apps/web/components/DateText.tsx` using `formatDate` (after T026, T027)

### Mobile foundation (apps/mobile)

- [X] T039 [P] Implement `apps/mobile/lib/supabase.ts` with a chunked `expo-secure-store` storage adapter (session persisted securely, opens offline with cached session — FR-012)
- [X] T040 [P] Implement `apps/mobile/lib/env.ts` (reject non-`https://` Supabase/API URLs except local dev hosts — FR-036a) + environment guard screen `apps/mobile/app/config-error.tsx` (FR-019a)
- [X] T041 Implement API client `apps/mobile/lib/api.ts` (Bearer token, error mapping to contracts, `USER_INACTIVE`/user-not-found → central sign-out handler)
- [X] T042 Implement auth gate `apps/mobile/app/_layout.tsx` (no session → sign-in, setup incomplete → setup, else tabs) and define `apps/mobile/lib/local-data.ts` interface `LocalDataStore` with `wipeAll(userId)`, `wipeExceptPending(userId)`, `pendingCount(userId)` (R1: no pending queue — returns 0; implemented by R2)
- [X] T043 Implement per-device `HideBalancesProvider` (AsyncStorage) and `apps/mobile/components/Money.tsx` + `apps/mobile/components/DateText.tsx` (after T026, T027)

### Environment scripts

- [X] T044 Implement `scripts/env-bootstrap.ts`: set `private.environment.name` from `APP_ENV`, create an `owner` invitation for `OWNER_EMAIL`, send it via SMTP (FR-013)
- [X] T045 [P] Create `supabase/seed.sql` (local only: environment row `demo`; no users, synthetic data only)

**Checkpoint**: `pnpm db:reset && pnpm db:test && pnpm test` green; web and mobile start and show sign-in

---

## Phase 3: User Story 1 — Invited person joins the app (Priority: P1) 🎯 MVP

**Goal**: Owner invites by email; invitee joins with email + password or Google; uninvited people
cannot create access.

**Independent Test**: Owner invites `asha.test@example.com`; Asha accepts via email + password and
reaches setup; `ravi.test@example.com` cannot create access by any route (quickstart S1-a…S1-f).

### Tests for User Story 1

- [X] T046 [P] [US1] pgTAP `supabase/tests/hooks.test.sql`: before-user-created accepts pending (case-insensitive), rejects uninvited/expired/revoked/superseded and unverified Google emails; trigger creates profile + preferences and marks accepted (database rule 7); token hook refuses a Google sign-in whose identity email no longer matches or is unverified (FR-004); accepting a just-revoked invitation fails (revoke-vs-accept race, Edge Cases)
- [X] T047 [P] [US1] Route tests `apps/web/app/api/invitations/[token]/accept/route.test.ts`: `ALREADY_ACCEPTED`, `INVITE_EXPIRED`, `INVITE_REVOKED`, `EMAIL_MISMATCH`, `WEAK_PASSWORD`, idempotent retry
- [X] T048 [P] [US1] Playwright `apps/web/e2e/us1-invitations.spec.ts`: invite → Mailpit link → accept → `/setup`; uninvited sign-up refused; expired/revoked/accepted link messages; token never visible in admin UI; a password user signing in again by any route stays the same user id. Google ↔ password linking (FR-005) is verified manually via quickstart S1-h because the local stack has no Google provider

### Implementation for User Story 1

- [X] T049 [US1] Implement `apps/web/lib/invitations.ts`: 32-byte random token, store only SHA-256 hash, `expires_at = created_at + 7 days`, send link `${WEB_BASE_URL}/invite/<token>`, set `delivery_status`, audit `invitation_created` / `invitation_delivery_failed`; never return or log the token (FR-003, FR-003a, FR-003b)
- [X] T050 [US1] Implement `POST /api/admin/invitations` in `apps/web/app/api/admin/invitations/route.ts` (owner only; `409 USER_EXISTS` incl. owner's own email, `409 INVITE_PENDING`, `422 INVALID_EMAIL`; returns `{id, expiresAt, deliveryStatus}`)
- [X] T051 [US1] Implement `GET /api/invitations/[token]` in `apps/web/app/api/invitations/[token]/route.ts` (status + masked email; `404 INVITE_NOT_FOUND` incl. superseded; `429 TRY_LATER` above 20 look-ups/min per address; lazily audit `invitation_expired`)
- [X] T052 [US1] Implement `POST /api/invitations/[token]/accept` in `apps/web/app/api/invitations/[token]/accept/route.ts` (validate token/email/password policy, require `privacyNoticeShown`, create confirmed auth user via admin API, set `privacy_notice_shown_at`, sign in server-side, return cookies on web / tokens on Android)
- [X] T053 [US1] Create migration `supabase/migrations/<ts>_record_sign_in.sql`: `app.record_sign_in(method text, device text)` for authenticated users (audit `sign_in_succeeded`, update `last_sign_in_at`)
- [X] T054 [P] [US1] Implement web `apps/web/components/PrivacyNotice.tsx` with the FR-036e text (what is stored; owner sees name, email, access status, last sign-in, never financial data; ask the owner to erase)
- [X] T055 [US1] Implement web invite page `apps/web/app/(public)/invite/[token]/page.tsx`: status messages, privacy notice before either path, email + password form with live policy hints, "Continue with Google"
- [X] T056 [US1] Implement OAuth callback `apps/web/app/auth/callback/route.ts`: exchange code; map hook error `INVITE_REQUIRED` to "invitation is for a different email / no invitation" message; call `app.record_sign_in('google','web')`
- [X] T057 [US1] Implement minimal owner invite form in `apps/web/app/(app)/admin/page.tsx` (email field + result incl. delivery failed; extended in US4)
- [X] T058 [P] [US1] Implement `apps/web/app/.well-known/assetlinks.json/route.ts` from `ANDROID_APP_ID` and `ANDROID_CERT_SHA256` (research R-03)
- [X] T059 [US1] Configure Android App Links in `apps/mobile/app.config.ts` (`intentFilters` with `autoVerify` for `https://<WEB_BASE_URL host>/invite/*` per profile) and map route `apps/mobile/app/invite/[token].tsx`
- [X] T060 [P] [US1] Implement mobile `apps/mobile/components/PrivacyNotice.tsx` (same text as web)
- [X] T061 [US1] Implement mobile OAuth helper `apps/mobile/lib/oauth.ts` (Supabase OAuth with PKCE via `expo-web-browser` auth session, code exchange, `app.record_sign_in('google','android')`)
- [X] T062 [US1] Implement mobile invite screen `apps/mobile/app/invite/[token].tsx` (lookup, privacy notice, email + password accept via API, Google via `lib/oauth.ts`)

**Checkpoint**: US1 passes T046–T048 and quickstart S1-a…S1-f

---

## Phase 4: User Story 2 — Sign in, stay signed in, sign out (Priority: P1)

**Goal**: Returning users sign in with Google or email + password, stay signed in, reset forgotten
passwords, are locked out after repeated failures and can sign out per device.

**Independent Test**: quickstart S2-a…S2-e and SEC-a.

### Tests for User Story 2

- [X] T063 [P] [US2] pgTAP `supabase/tests/lockout.test.sql`: 5 consecutive failures since last success → `locked_until = now() + 15 min`; success resets; token hook refuses locked email
- [X] T064 [P] [US2] Unit tests `apps/web/lib/session-idle.test.ts` (30-min idle rule only when "Keep me signed in" is unticked)
- [X] T065 [P] [US2] Playwright `apps/web/e2e/us2-sign-in.spec.ts`: sign in/out, 6th wrong password `LOCKED` with retry time, reset via Mailpit (1-hour single-use link, common password rejected, other sessions ended), reset limit 3/hour with neutral message, idle sign-out with `IDLE_MINUTES=1`

### Implementation for User Story 2

- [X] T066 [US2] Create migration `supabase/migrations/<ts>_lockout.sql`: `app.register_failed_sign_in(email)` (writes `sign_in_failed`; on 5th consecutive sets lock and writes `sign_in_locked`) and `app.clear_failed_sign_ins(email)` — service role only
- [X] T067 [US2] Implement session cookie policy `apps/web/lib/session-cookies.ts` (HttpOnly, Secure, SameSite=Lax; persistent when "Keep me signed in", otherwise no Max-Age; `ft_last_active` cookie)
- [X] T068 [US2] Implement `POST /api/auth/sign-in` in `apps/web/app/api/auth/sign-in/route.ts` (`423 LOCKED {retryAfter}`, `401 INVALID_CREDENTIALS`, `401 USER_INACTIVE`; audits; `last_sign_in_at`; cookies on web, tokens on Android)
- [X] T069 [US2] Extend `apps/web/middleware.ts` with the 30-minute idle rule and add `apps/web/components/IdleWarning.tsx` (1-minute warning)
- [X] T070 [US2] Implement `POST /api/auth/password-reset` in `apps/web/app/api/auth/password-reset/route.ts` (always `202` neutral; max 3 per email per hour; audit `password_reset_requested` with hashed email)
- [X] T071 [US2] Implement `POST /api/auth/password-reset/complete` in `apps/web/app/api/auth/password-reset/complete/route.ts` (password policy; end all other sessions, keep current; audit `password_reset_completed`)
- [X] T072 [US2] Implement `POST /api/auth/sign-out` in `apps/web/app/api/auth/sign-out/route.ts` (current device only; audit `signed_out`)
- [X] T073 [US2] Implement `GET /api/me/sign-in-activity` in `apps/web/app/api/me/sign-in-activity/route.ts` (own successful/failed sign-ins and lockouts with time, method, device — FR-039)
- [X] T074 [US2] Implement web pages `apps/web/app/(public)/sign-in/page.tsx` (Google + email/password, "Keep me signed in" unticked by default, lockout message with retry time), `forgot-password/page.tsx`, `reset-password/page.tsx`
- [X] T075 [US2] Implement mobile `apps/mobile/app/sign-in.tsx` and `apps/mobile/app/forgot-password.tsx` (password sign-in via API, Google via `lib/oauth.ts`)
- [X] T076 [US2] Implement mobile sign-out `apps/mobile/lib/sign-out.ts`: warn with `LocalDataStore.pendingCount`, offer "Send now" / "Sign out anyway (discard unsent changes)"; never discard without confirmation; call `POST /api/auth/sign-out` with `device: "android"` (audit `signed_out`) before clearing the local session
- [X] T077 [US2] Add "Sign-in activity" section to web `apps/web/app/(app)/settings/page.tsx` and mobile `apps/mobile/app/(tabs)/settings/index.tsx`

**Checkpoint**: US1 + US2 = MVP (invite, join, sign in/out, reset, lockout)

---

## Phase 5: User Story 3 — First-run setup and regional preferences (Priority: P2)

**Goal**: Users complete setup once and control number/date formats, FY start and timezone.

**Independent Test**: quickstart S3-a, S3-b, S1-g.

### Tests for User Story 3

- [X] T078 [P] [US3] pgTAP `supabase/tests/preferences.test.sql`: base currency locked after setup (rule 9), own row only, invalid timezone rejected, `preference_changed` audit with before/after
- [X] T079 [P] [US3] Playwright `apps/web/e2e/us3-preferences.spec.ts`: setup with defaults shows `₹12,34,567.00` and `11-Oct-2026`; switch to international → `₹1,234,567.00` without reload; base currency read-only

### Implementation for User Story 3

- [X] T080 [US3] Implement repositories `packages/db/src/repositories/profile.ts` and `packages/db/src/repositories/preferences.ts`
- [X] T081 [US3] Implement `GET /api/me`, `POST /api/me/setup` (display name "1–50 chars after trim"; `privacyNoticeShown` required when not yet recorded — Google path; `409 SETUP_ALREADY_COMPLETE`; audit `setup_completed`) and `PATCH /api/me/preferences` (`422 BASE_CURRENCY_LOCKED`) in `apps/web/app/api/me/`
- [X] T082 [P] [US3] Implement web `PreferencesProvider` in `apps/web/components/providers/PreferencesProvider.tsx` feeding `Money`/`DateText`
- [X] T083 [P] [US3] Implement mobile `PreferencesProvider` in `apps/mobile/components/providers/PreferencesProvider.tsx` (cache in AsyncStorage for offline open)
- [X] T084 [US3] Implement web setup `apps/web/app/(app)/setup/page.tsx` (defaults INR, Indian grouping, `dd-MMM-yyyy`, April, Asia/Kolkata; privacy notice if not yet shown)
- [X] T085 [US3] Implement web preferences + live preview in `apps/web/app/(app)/settings/page.tsx`
- [X] T086 [US3] Implement mobile `apps/mobile/app/setup.tsx` (same defaults as web; show `components/PrivacyNotice.tsx` and send `privacyNoticeShown` when not yet recorded — Google path, FR-036e) and preferences + live preview in `apps/mobile/app/(tabs)/settings/index.tsx`

**Checkpoint**: US3 works independently on top of the MVP

---

## Phase 6: User Story 4 — Owner-admin manages invitations and access (Priority: P2)

**Goal**: Owner lists invitations/users, resends/revokes, disables/re-enables and erases users,
without seeing financial data.

**Independent Test**: quickstart S4-a…S4-e, SEC-d, SEC-e.

### Tests for User Story 4

- [X] T087 [P] [US4] pgTAP `supabase/tests/admin.test.sql`: `admin_list_users` returns only FR-014 columns; owner cannot be disabled/erased; second owner rejected (rule 10); after erase no audit row or invitation contains the email/id (rule 8); `details` never contains tokens (rule 12); a user disabled or erased mid-setup can no longer update their profile or preferences (erase/disable precedence, Edge Cases)
- [X] T088 [P] [US4] Playwright `apps/web/e2e/us4-admin.spec.ts`: revoke → link fails; resend supersedes; disable → requests refused within 1 minute; enable restores data; erase wrong email → nothing erased, correct email → user gone and email re-invitable; member denied `/admin`

### Implementation for User Story 4

- [X] T089 [US4] Create migration `supabase/migrations/<ts>_admin.sql`: `app.admin_list_users()`, `app.admin_audit_feed(cursor)`, `app.set_user_status(user_id, status)` (refuses owner; audits `user_disabled`/`user_enabled`), `app.scrub_user_from_audit(user_id)` (replace refs with `erased:<uuid>`, delete all invitations for the email) — service role only
- [X] T090 [US4] Implement `GET /api/admin/overview` and `GET /api/admin/audit` in `apps/web/app/api/admin/`
- [X] T091 [US4] Implement `POST /api/admin/invitations/[id]/resend` and `/revoke` in `apps/web/app/api/admin/invitations/[id]/resend/route.ts` and `apps/web/app/api/admin/invitations/[id]/revoke/route.ts` (`409 NOT_RESENDABLE`, `409 NOT_PENDING`; audit `invitation_resent` / `invitation_revoked`; resend sends the new link and records `delivery_status`)
- [X] T092 [US4] Implement `POST /api/admin/users/[id]/disable` and `/enable` in `apps/web/app/api/admin/users/[id]/disable/route.ts` and `apps/web/app/api/admin/users/[id]/enable/route.ts` (status + auth ban; `409 CANNOT_TARGET_OWNER`, `409 NOT_DISABLED`)
- [X] T093 [US4] Implement `POST /api/admin/users/[id]/erase` in `apps/web/app/api/admin/users/[id]/erase/route.ts` (`confirmEmail` case-insensitive match else `422 CONFIRMATION_MISMATCH`; scrub audit → delete invitations → audit `user_erased` → delete auth user; never returns user data)
- [X] T094 [US4] Complete web admin `apps/web/app/(app)/admin/page.tsx`: invitations table (status, delivery failed + resend, revoke), users table, disable/enable, erase dialog with dual confirmation, audit feed
- [X] T095 [US4] Implement mobile admin screens `apps/mobile/app/admin/index.tsx` and `apps/mobile/app/admin/erase/[id].tsx` (same capabilities and dual confirmation)
- [X] T096 [US4] Implement forced sign-out handling: web `apps/web/lib/api/client.ts` (on `USER_INACTIVE` → sign-out page); mobile `apps/mobile/lib/session-watch.ts` (check `/api/me` on foreground; inactive → sign out; user not found → `LocalDataStore.wipeAll`)
- [X] T097 [US4] Implement `scripts/env-recover-owner.ts` (moves owner role to a new email via invitation; audits `owner_recovered`; touches no other user's data — FR-013a)

**Checkpoint**: US4 works independently; admin never sees financial data

---

## Phase 7: User Story 5 — Signed-in app shell (Priority: P2)

**Goal**: Consistent navigation on web and Android with placeholders, demo marker and offline
indicator.

**Independent Test**: quickstart S5-a, S5-b.

### Tests for User Story 5

- [X] T098 [P] [US5] Playwright `apps/web/e2e/us5-shell.spec.ts`: every nav entry opens with active highlight; Demo badge when `APP_ENV=demo`; admin entry only for owner
- [X] T099 [P] [US5] Jest `apps/mobile/__tests__/shell.test.tsx`: offline banner appears within 5 s of connectivity loss (2 s debounce), Demo badge, admin tab visibility

### Implementation for User Story 5

- [X] T100 [US5] Implement web shell `apps/web/components/shell/` (sidebar ≥ 1024 px, top bar + drawer below; entries Dashboard, Accounts, Transactions, Payment plan, Settings, Admin for owner; `DemoBadge`; slot for hide-balances toggle) and wire into `apps/web/app/(app)/layout.tsx`
- [X] T101 [P] [US5] Create web placeholders `apps/web/app/(app)/page.tsx`, `accounts/page.tsx`, `transactions/page.tsx`, `payment-plan/page.tsx` ("Coming soon")
- [X] T102 [US5] Implement mobile tabs `apps/mobile/app/(tabs)/_layout.tsx` with placeholder screens and owner-only admin entry
- [X] T103 [US5] Implement `apps/mobile/components/OfflineBanner.tsx` (NetInfo `isInternetReachable`, 2 s debounce) and `apps/mobile/components/DemoBadge.tsx`
- [X] T104 [US5] Implement "service temporarily unavailable" state: `apps/web/app/unavailable/page.tsx` and `apps/mobile/components/ServiceUnavailable.tsx` (backend unreachable/paused)

**Checkpoint**: Shell complete on both platforms

---

## Phase 8: User Story 6 — Android app lock (Priority: P3)

**Goal**: PIN + optional fingerprint lock with timeout, recents preview hidden, screenshots allowed.

**Independent Test**: quickstart S6-a…S6-c, SEC-c.

### Tests for User Story 6

- [X] T105 [P] [US6] Jest `apps/mobile/__tests__/app-lock.test.ts`: timeouts 0/60/300/900 s; PIN 4–6 digits; 5 wrong PINs → sign out + `wipeExceptPending(userId)`; forgot PIN clears PIN after sign-in; biometric key unreadable → fingerprint suspended until PIN

### Implementation for User Story 6

- [X] T106 [P] [US6] Implement `apps/mobile/lib/app-lock/pin.ts` (scrypt hash with per-device random salt in SecureStore; never stores the PIN)
- [X] T107 [P] [US6] Implement `apps/mobile/lib/app-lock/settings-store.ts` (enabled, timeout, biometrics, failedAttempts in SecureStore)
- [X] T108 [P] [US6] Implement `apps/mobile/lib/app-lock/biometrics.ts` (`expo-local-authentication` strong class only; biometric-bound SecureStore key with `requireAuthentication` to detect enrolment change — FR-026a/b)
- [X] T109 [US6] Implement `apps/mobile/lib/app-lock/controller.ts` (AppState background timestamp vs timeout; lock state; 5 wrong PINs → sign out + `LocalDataStore.wipeExceptPending(userId)` with pending entries tagged to the user — FR-028)
- [X] T110 [US6] Create Expo config plugin + native module `apps/mobile/plugins/recents-privacy/` calling `setRecentsScreenshotEnabled(false)` on Android 13+ while lock is enabled, and `apps/mobile/components/PrivacyOverlay.tsx` for older Android (screenshots stay allowed — FR-027)
- [X] T111 [US6] Implement lock screen `apps/mobile/app/lock.tsx` (PIN pad, fingerprint prompt, "Forgot PIN")
- [X] T112 [US6] Implement app-lock settings `apps/mobile/app/(tabs)/settings/app-lock.tsx` (setup with confirmation, timeout choice, fingerprint toggle, FR-028 explanation)
- [X] T113 [US6] Implement `POST /api/me/audit` in `apps/web/app/api/me/audit/route.ts` and call it on enable/disable (`app_lock_enabled`/`app_lock_disabled`)

**Checkpoint**: App lock works on a physical Android device

---

## Phase 9: User Story 7 — Hide-balances mode (Priority: P3)

**Goal**: One per-device toggle masks every amount the app shows.

**Independent Test**: quickstart S7-a.

### Tests for User Story 7

- [ ] T114 [P] [US7] Unit tests `apps/web/components/Money.test.tsx` and `apps/mobile/__tests__/money.test.tsx` (masked output never reveals digit count; toggle off restores immediately) — web half done (`Money.test.tsx`); mobile half deferred (web-first order)
- [X] T115 [P] [US7] Playwright `apps/web/e2e/us7-hide-balances.spec.ts` (toggle persists across reload; other device unaffected)

### Implementation for User Story 7

- [X] T116 [P] [US7] Implement `apps/web/components/shell/HideBalancesToggle.tsx` in the navigation header
- [ ] T117 [P] [US7] Implement `apps/mobile/components/HideBalancesToggle.tsx` in the tab header — deferred until Android work resumes (web-first order)

**Checkpoint**: All seven user stories complete

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T118 [P] Create `.github/workflows/keep-alive.yml` (daily call to `app.health()` on the demo project using repository secrets)
- [X] T119 [P] Update `README.md` with developer setup pointing to `specs/001-identity-access-shell/quickstart.md`
- [ ] T120 Accessibility pass on `apps/web/components/shell/`, `apps/web/app/(app)/settings/`, `apps/web/app/(app)/admin/` and `apps/mobile/app/(tabs)/` (labels, focus order, status not by colour alone — Principle XIII) — web done (`apps/web/e2e/a11y.spec.ts`: axe WCAG 2.1 AA scan + keyboard test); Android tabs deferred (web-first order)
- [X] T121 Prepare owner review notes `specs/001-identity-access-shell/review-notes.md` listing the files needing explicit review (auth hooks, RLS policies, erase flow, sign-in endpoint, PIN storage) per constitution workflow
- [ ] T122 Add `apps/web/e2e/audit-coverage.spec.ts` (drives the story flows and asserts each of the 20 FR-037 actions is recorded and no event `details` contains a password, PIN, token or amount — SC-008); then run full quickstart validation (S1-a…S7-a, SEC-a…SEC-e, PERF-a on a physical Android device for SC-004) and record results in `specs/001-identity-access-shell/validation.md` — web done (`audit-coverage.spec.ts`, `validation.md`); Android and PERF-a rows open (web-first order)
- [ ] T123 Owner-assisted: create hosted demo environment (Supabase Free project, Vercel project, Gmail SMTP, Google OAuth, EAS `demo` build, `pnpm env:bootstrap`) following `specs/001-identity-access-shell/quickstart.md` §Hosted demo environment; record outcomes in `specs/001-identity-access-shell/validation.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories → **Polish (Phase 10)**
- Foundational blocks every story (schema, access rules, clients, Money/DateText, auth gate).

### User Story Dependencies

- **US1 (P1)**: after Foundational. No story dependencies.
- **US2 (P1)**: after Foundational; reuses `lib/oauth.ts` (T061) for Google sign-in — do US1 first.
- **US3 (P2)**: after Foundational; owner/test users created via US1 flows (or seed in tests).
- **US4 (P2)**: after US1 (extends the invite form and invitation library).
- **US5 (P2)**: after Foundational; independent of US1–US4 except the owner-only entry.
- **US6 (P3)**: after Foundational + mobile sign-in (US2 T075).
- **US7 (P3)**: after Foundational (Money + provider exist); toggles slot into the US5 shell.

### Within Each Story

Tests first (fail) → migrations/repositories → API routes → web UI → mobile UI → checkpoint.

### Parallel Opportunities

- Setup: T002, T003, T006, T007, T009–T012
- Foundational: T026–T029 (pure core), T031, T032, T034, T035, T039, T040, T045 (T024 after T023; T038/T043 after T026–T027)
- US1: tests T046–T048 together; T054, T058, T060 alongside routes
- US3: T082 and T083; US5: T101 with T100; US6: T106–T108; US7: T116 and T117
- With two developers after Foundational: one on web-heavy stories (US1, US4), one on mobile-heavy (US6, then US5 mobile)

---

## Parallel Example: User Story 1

```bash
# Tests first, together:
Task: "pgTAP hooks test in supabase/tests/hooks.test.sql"
Task: "Accept route tests in apps/web/app/api/invitations/[token]/accept/route.test.ts"
Task: "Playwright invitations spec in apps/web/e2e/us1-invitations.spec.ts"

# Independent UI pieces alongside the routes:
Task: "Web PrivacyNotice in apps/web/components/PrivacyNotice.tsx"
Task: "assetlinks route in apps/web/app/.well-known/assetlinks.json/route.ts"
Task: "Mobile PrivacyNotice in apps/mobile/components/PrivacyNotice.tsx"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 Setup → Phase 2 Foundational (checkpoint: db + unit tests green)
2. Phase 3 US1 → validate S1-a…S1-f
3. Phase 4 US2 → validate S2-a…S2-e → **owner review of the MVP diff** (auth hooks, RLS, sign-in endpoint)

### Incremental Delivery

4. US3 → US4 → US5 → US6 → US7, each validated against its quickstart rows and reviewed as its own
   batch
5. Polish → full quickstart validation → hosted demo environment → PR into `main`

---

## Notes

- [P] = different files, no dependency on incomplete tasks
- Every amount and date in UI must go through `Money`/`DateText` (lint rule T011)
- No real personal data anywhere — fixtures use `example.com`
- Commit after each task or logical group; never commit `.env*` or data files
- Stop at each checkpoint to validate the story independently
