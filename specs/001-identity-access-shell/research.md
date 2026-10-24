# Research: Identity, Access & App Shell (R1)

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Date**: 2026-10-11

Platform facts were verified against vendor documentation on 2026-10-11 (sources at the end).
Re-verify versions at implementation time; free-tier terms change without notice.

---

## R-01 Invite-only enforcement (FR-001, FR-004, FR-005)

**Decision**: Own `invitations` table + Supabase Auth **Before User Created hook** implemented as
a Postgres function. Public sign-ups stay technically enabled (so Google OAuth can create users),
but the hook rejects any new user whose email (case-insensitive) has no `pending`, unexpired
invitation. An `AFTER INSERT` trigger on `auth.users` then creates the profile and preferences rows
and marks the invitation `accepted`.

**Rationale**: The hook runs for *every* user-creation path — email/password created by our server,
Google OAuth, and direct calls to the Auth API with the public anon key — so invite-only cannot be
bypassed from a client. It is available on the Free plan. A Postgres-function hook needs no extra
service.

**Alternatives considered**:
- *Disable sign-ups + `auth.admin.inviteUserByEmail`*: pre-creates the auth user at invite time
  (pending users clutter `auth.users`), invite links use email OTP whose max lifetime is 24 h (spec
  needs 7 days), and Google sign-in for a not-yet-accepted invite becomes awkward. Rejected.
- *App-level check only*: bypassable via the public Auth API. Violates Principle I/VIII. Rejected.

## R-02 Invitation links and email delivery (FR-003, FR-004a, FR-008)

**Decision**:
- Invitation token: 32 random bytes, sent only in the email link; only its SHA-256 hash is stored.
  Link: `https://<web-host>/invite/<token>`; 7-day expiry; resend supersedes the previous row.
- Invitation emails are sent by **our server** (Next.js route handler, `nodemailer`) via SMTP.
  Password-reset emails are sent by **Supabase Auth via custom SMTP** — the same SMTP account.
- **SMTP provider (default)**: a dedicated Gmail account with an App Password (free, ~500
  messages/day, no domain required). **If the owner acquires a domain**, switch to Resend (free:
  3,000/month, 100/day, requires a verified domain) by changing env vars only.

**Confirmed by owner (2026-10-11)**: no domain → dedicated Gmail account + App Password; no
existing Supabase projects (both free slots available for demo + live); Docker Desktop installed
for the local stack.

**Rationale**: Supabase's default sender only delivers to project team members and is capped at
~2 emails/hour — unusable for testers. Custom SMTP is free and also lifts the free-tier template
restriction. Gmail SMTP needs no domain purchase (Principle XI); fewer than 20 users makes
volume irrelevant.

**Alternatives considered**: Resend (needs a domain), Brevo (single-sender From addresses often
fail DMARC with free mailbox domains), Supabase Send Email hook (still needs a sender).

## R-03 Android: opening the invitation in the app (FR-004a)

**Decision**: Android **App Links** for `https://<web-host>/invite/*`, configured in the Expo app
config (`intentFilters` with `autoVerify`) plus `/.well-known/assetlinks.json` served by the web
app. expo-router maps `/invite/[token]` in both apps. When the app is not installed, Android opens
the web page, which also shows how to install the APK.

**Rationale**: One link works everywhere; verification needs only a file on the web host (works on
a `*.vercel.app` domain). Separate `demo`/`live` builds use different application IDs and hosts.

**Alternatives considered**: custom scheme (`financetracker://`) — no web fallback, rejected as
primary (kept for OAuth redirects).

## R-04 Password policy (FR-007)

**Decision**: Supabase Auth setting *minimum password length = 8* (enforced by Auth itself) **plus**
a bundled list of the 10,000 most common passwords in `packages/core` (`isCommonPassword`) checked
in our server endpoints that set passwords (accept-invitation, complete-reset) and in the client
forms.

**Rationale**: Supabase leaked-password protection (HaveIBeenPwned) is Pro-only. A bundled list is
free, offline and deterministic to test.

**Residual risk (accepted)**: a signed-in user could deliberately call the Auth API directly to set a
common (≥ 8 char) password on their *own* account. Only harms themselves; documented.

**Alternatives considered**: HIBP k-anonymity range API from our server (free, but a network
dependency in a critical path) — deferred, can be added behind the same function.

## R-05 Failed sign-in lockout (FR-009)

**Decision**: Email/password sign-in goes through our **server endpoint** `POST /api/auth/sign-in`,
which checks `private.sign_in_attempts` (5 failures → `locked_until = now() + 15 min`), calls
Supabase password sign-in server-side, records success/failure, and returns the session. A
**Custom Access Token hook** (Free plan) additionally refuses to issue or refresh tokens for an email
that is currently locked or a user whose status is `disabled`.

**Rationale**: Supabase's Password Verification Attempt hook (the native way) is Team/Enterprise
only. Built-in limits are per IP (token endpoint ~150 requests / 5 min), not per email.

**Residual risk (accepted)**: failures made by calling the Auth API directly (bypassing our
endpoint) are not counted; they remain bounded by Supabase's per-IP rate limits and the password
policy. Documented in quickstart security notes.

## R-06 Disabling and erasing users (FR-015, FR-016a, SC-007)

**Decision**:
- **Disable**: set `profiles.status = 'disabled'` and ban the auth user (`ban_duration`) so new
  sign-ins fail. Every RLS policy on user data calls `app.is_active_user()`, so data access stops
  on the very next request; the Custom Access Token hook refuses refreshes. Apps treat the
  resulting "inactive" response as a forced sign-out. Re-enable reverses both.
- **Erase**: server endpoint (owner only) verifies the typed email, then a `SECURITY DEFINER`
  function scrubs the user's identifiers from `audit_events` (replaces them with an opaque
  `erased:<uuid>` reference), writes the `user_erased` event, and the server deletes the auth user;
  every user-owned table references `auth.users(id) ON DELETE CASCADE`, so all data goes with it.
  On next contact, Android apps receive "user not found" → sign out and wipe local data.

**Rationale**: Meets SC-007 (≤ 1 min) without waiting for the 1-hour JWT expiry; no data is ever
returned to the owner during erasure (Principle I as amended).

## R-07 Privileged operations: where they run

**Decision**: **Next.js route handlers** in `apps/web` (Vercel serverless) using the service-role
key, which is only present server-side. The mobile app calls the same HTTPS endpoints with its
user JWT. Supabase Edge Functions are not used in R1.

**Rationale**: One deployment target, one language/runtime, shared Zod contracts with the web app,
local dev via `next dev`. Vercel Hobby limits are ample for < 20 users.

**Alternatives considered**: Edge Functions (Deno; a second runtime and deployment, harder sharing
of `packages/core`) — rejected for now.

## R-08 Web sessions and "Keep me signed in" (FR-010, Clarification Q1)

**Decision**: `@supabase/ssr` cookie sessions. *Keep me signed in* ticked → persistent auth cookies;
unticked → cookies without `Max-Age` (end when the browser closes) **and** an `ft_last_active`
cookie refreshed on activity; Next.js middleware signs the user out when it is older than 30 min.
A client idle timer shows a 1-minute warning before sign-out.

## R-09 Android session, app lock and privacy (FR-012, FR-026–FR-030)

**Decision**:
- Session storage: Supabase JS with a `expo-secure-store`–backed storage adapter (chunked for size).
- PIN: never stored in plain text — `scrypt`-derived hash with per-device random salt in
  `expo-secure-store`; wrong-attempt counter also in secure store; 5 failures → sign out on device.
- Biometrics: `expo-local-authentication` (fingerprint/face, strong class only); PIN fallback.
- Recents preview (FR-027, clarified 2026-10-13: screenshots stay allowed): Android 13+ (API 33)
  `Activity.setRecentsScreenshotEnabled(false)` via a small Expo config plugin / native module
  while lock is enabled; older Android: privacy overlay rendered on `AppState` → `background`
  (best effort). FLAG_SECURE / `preventScreenCaptureAsync` is **not** used because it would also
  block screenshots.
- Wrong-PIN sign-out (FR-028, clarified): remove cached data and session but keep the not-yet-sent
  change queue, tagged with the user id; it is hidden from the UI and flushed only after the same
  user signs back in on that device. (R1 has no change queue yet — R2's sync engine must honour this
  rule.)
- Timeout: timestamp on background, compared on foreground (`AppState`).

## R-10 Online/offline indicator (FR-036)

**Decision**: `@react-native-community/netinfo` (`isInternetReachable`) driving a shell banner;
debounced 2 s to avoid flicker. R1 stores no offline data; the session and preferences are cached
so the app opens offline (FR-012). **The offline sync engine is deliberately not chosen here**
(R2's plan); R1's data layer is a thin repository interface in `packages/db` so R2 can place a
local-first store behind it without changing screens.

## R-11 Hide-balances & money display (FR-031–FR-033, Principle XIII)

**Decision**: `packages/core` exports `formatMoney(minorUnits: bigint, currency, prefs)` and
`maskMoney(currency)` (fixed `₹••••`). Each app has exactly one `<Money>` component that reads the
per-device `hideBalances` flag (web: `localStorage`; Android: `AsyncStorage`) from a context and
calls the core functions. A lint rule (`no-restricted-syntax` on direct `formatMoney` imports in
`apps/*` outside `Money`) keeps every screen on the shared path.

## R-12 UI stack

**Decision**: Web — **Tailwind CSS + shadcn/ui** (copy-in components, no runtime dependency,
accessible Radix primitives). Mobile — **NativeWind** (Tailwind classes in React Native) with a
small set of in-repo components, sharing one Tailwind design-token preset in `packages/config`.

**Rationale**: One styling vocabulary for both apps; minimal dependencies. **Risk**: NativeWind
can lag new Expo SDKs — fallback is React Native Paper for mobile only, no impact on web or core.

## R-13 Owner-admin bootstrap (FR-013)

**Decision**: Environment variable `OWNER_EMAIL`; `pnpm env:bootstrap` (service role) inserts the
first invitation with `role = 'owner'` and sends it. A partial unique index allows at most one
`owner` profile; there is no API to grant, remove or transfer the role.

## R-14 Audit history (FR-037–FR-039, Principle III)

**Decision**: `public.audit_events` (append-only: no UPDATE/DELETE grants or policies; inserts only
via `SECURITY DEFINER` functions and triggers). A generic `audit.capture_change()` trigger records
before/after JSON for audited tables (used for preferences now; reused by every financial table
later). Sign-in events are written by our sign-in endpoint (password) and by an
`app.record_sign_in()` RPC called after Google OAuth completes. The only mutation path is the
erasure scrub function (constitution III(b)).

## R-15 Environments & keep-alive (FR-019, FR-035, Principle VI/XI)

**Decision**: Two Supabase Free projects (`demo`, `live` — the Free plan's maximum of 2 active
projects), two Vercel projects/deployments from the same repo, EAS build profiles `demo`/`live`
with different Android application IDs. `APP_ENV=demo|live` drives the Demo marker. Local
development and CI use the Supabase CLI local stack (Docker), not a hosted project. A scheduled
GitHub Actions workflow calls a lightweight health RPC on the demo project daily so it is not paused
for inactivity; live is used daily once real.

## R-16 Testing toolchain (Principle IX)

**Decision**: Vitest (`packages/core`, `packages/db`, web unit); **pgTAP via `supabase test db`**
for RLS isolation (user A vs user B vs owner), hooks, triggers, audit append-only; **Playwright**
web E2E for stories 1–4 against the local stack, reading emails from the local Mailpit inbox;
Jest + React Native Testing Library for mobile units (lock state machine, Money masking, timeout
logic); manual Android checks in quickstart for biometrics/App Links. CI: GitHub Actions
(unlimited minutes on a public repo).

## R-17 Versions (verify at implementation)

Node.js 24 LTS · pnpm 10 · Turborepo 2 · TypeScript 5.x strict · Next.js 16 (App Router) ·
React 19 · Expo SDK 57 (expo-router) · supabase-js 2 · @supabase/ssr · Zod 4 · Tailwind CSS 4 ·
Vitest · Playwright · Supabase CLI (latest).

## R-18 Security baseline after checklist review (FR-036a–e)

**Decision**: Rotation procedure distinguishes (a) service-role key and SMTP password — no user
impact — from (b) the project's session-signing (JWT) secret — rotating it signs everyone out and is
used only on suspected compromise (FR-036c). The privacy notice is shown on `/invite/[token]` before
either joining path; the email path records it in the accept call, the Google path records it in
`POST /api/me/setup` (FR-036e).

HTTPS is enforced by the hosting platforms; web cookies `HttpOnly` + `Secure` +
`SameSite=Lax` with an `Origin` check on all state-changing routes; a shared server error helper
logs only `errorId`, route and error class. Key/SMTP rotation is an env-var change documented in
the quickstart runbook. The privacy notice is a static component in the join flow.

## R-19 Rate limiting public endpoints (FR-008a)

**Decision**: Fixed-window counters in `private.rate_limits` (Postgres), keyed by SHA-256 of the
email or client address. **Rationale**: no extra service (Redis/KV) needed at this scale
(Principle XI). **Alternatives**: Upstash/Vercel KV free tiers — another account and dependency.

## R-20 Biometric enrolment changes (FR-026b)

**Decision**: When fingerprint unlock is enabled, store a random secret in `expo-secure-store` with
`requireAuthentication: true`; Android invalidates such keys when biometric enrolment changes, so a
failed read signals the change → suspend fingerprint unlock until the PIN is entered and the user
re-confirms. **Alternative**: polling enrolment state — not exposed reliably by Expo APIs.

## R-21 Environment mismatch guard (FR-019a)

**Decision**: `private.environment` holds `demo`/`live`; `app.health()` returns it; both apps call it
at start-up and refuse to run (configuration error screen) when it differs from the build's
`APP_ENV`.

## R-22 Owner-admin recovery (FR-013a)

**Decision**: `pnpm env:recover-owner --new-email <email>` (service role, run by the environment
operator) moves the `owner` role to a new invitation/profile, writes `owner_recovered`, and touches
no other user's data. Documented in the quickstart runbook.

---

### Sources (accessed 2026-10-11)

- Supabase Auth Hooks & plan availability: https://supabase.com/docs/guides/auth/auth-hooks
- Before User Created hook: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
- Password Verification hook: https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook
- Password security (leaked-password protection): https://supabase.com/docs/guides/auth/password-security
- Custom SMTP & default-sender restrictions: https://supabase.com/docs/guides/auth/auth-smtp
- Auth rate limits: https://supabase.com/docs/guides/auth/rate-limits
- Free project pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Pricing (Free limits): https://supabase.com/pricing
- Resend free tier (third-party summaries; confirm at resend.com/pricing): https://freetier.co/articles/free-email-sending-tiers-2026
- Expo Router reference (SDK 57): https://docs.expo.dev/versions/latest/sdk/router
