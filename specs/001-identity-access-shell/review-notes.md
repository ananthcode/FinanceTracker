# Owner review notes — R1 Identity, Access & App Shell

Constitution, *Development Workflow*: all AI-generated code is reviewed by the owner, and changes
to **authentication, access policies, sync or money arithmetic** need explicit, called-out review.
This file lists those files for R1, what to look for in each, and which tests already prove the
behaviour. Everything else in the PR is ordinary review.

Android app lock (US6: PIN storage, biometrics) and the Android hide-balances toggle are **not in
this PR** — deferred by the owner's web-first decision. They get their own review notes.

## 1. Database access rules (Principle I — highest risk)

| File | Check |
|------|-------|
| `supabase/migrations/20261013000008_access_rules.sql` | Every table has RLS enabled with **default deny**; each policy filters on `auth.uid()` **and** `app.is_active_user()`; no policy grants another user's rows. `app.health()` is the only function granted to `anon`. |
| `supabase/migrations/20261013000006_private_tables.sql` | `private` schema is not exposed to the API; only `service_role` can touch it. |
| `supabase/migrations/20261013000007_audit.sql` | Audit table is append-only (no UPDATE/DELETE grants); `app.write_audit` strips keys matching token/password/pin/secret/hash. |
| `supabase/migrations/20261021000003_admin.sql` | Admin functions are `security definer` with a fixed `search_path`, executable by `service_role` only; owner cannot be disabled/erased; erase scrubs audit identifiers. |

Proof: `pnpm db:test` (pgTAP, 82 tests) — chiefly `rls_isolation.test.sql`, `admin.test.sql`.

## 2. Who may get an account (invite-only)

| File | Check |
|------|-------|
| `supabase/migrations/20261013000010_auth_hooks.sql` | *Before User Created* hook rejects any email without a valid pending invitation, including Google sign-ups. *Custom Access Token* hook adds only role/status claims. |
| `supabase/migrations/20261013000009_on_auth_user_created.sql`, `20261022000001_owner_recovery.sql` | New user → profile from the invitation; invitation marked accepted once. An **owner** invitation moves the owner role (only `service_role` can create one). |
| `supabase/migrations/20261021000002_email_normalisation.sql` | Emails compared case-insensitively everywhere (`lower()`), so `Asha@…` and `asha@…` are one person. |
| `apps/web/app/api/invitations/[token]/accept/route.ts`, `apps/web/lib/invitations.ts`, `packages/db/src/server/invitations.ts` | Token stored only as SHA-256; expiry, revoked and superseded states refused; the token never appears in logs or audit. |

Proof: `us1-invitations.spec.ts`, `route.int.test.ts`, `hooks.test.sql`.

## 3. Sign-in, sessions and lockout

| File | Check |
|------|-------|
| `apps/web/app/api/auth/sign-in/route.ts` | Same neutral error for unknown email and wrong password; 5 failures in 15 min lock the email; disabled users get `USER_INACTIVE`. |
| `supabase/migrations/20261021000001_lockout.sql`, `apps/web/lib/rate-limit.ts` | Rate-limit keys are SHA-256 buckets, never raw emails or IPs. |
| `apps/web/app/api/auth/password-reset/**` | Neutral reply; at most 3 emails per address per hour; reset ends other sessions. |
| `apps/web/proxy.ts`, `apps/web/lib/session-cookies.ts`, `apps/web/lib/session.ts` | HttpOnly cookies; 30-minute idle rule unless "Keep me signed in"; inactive users signed out; owner-only `/admin`; backend outage shows `/unavailable` instead of signing anyone out. |
| `apps/web/lib/api/handler.ts` | CSRF: same-origin `Origin` or the Android `X-FT-Client` header (with bearer token); errors never leak internals. |
| `apps/web/app/auth/google`, `auth/callback`, `auth/confirm` | OAuth/PKCE and email links redirect only to same-site paths (no open redirect). |

Proof: `us2-sign-in.spec.ts`, `lockout.test.sql`, `handler.test.ts`, `session-idle.test.ts`, `proxy.test.ts`.

## 4. Owner-admin actions (US4)

| File | Check |
|------|-------|
| `apps/web/lib/admin.ts`, `apps/web/app/api/admin/**` | Every route re-checks owner role server-side; erase requires the exact email; disable also bans the auth user; responses contain no preferences or financial data. |
| `scripts/env-bootstrap.ts`, `scripts/env-recover-owner.ts`, `scripts/lib/owner-invitation.ts` | Run with the service-role key by the operator only; tokens only in the email; stale owner invitations revoked. |

Proof: `us4-admin.spec.ts`, `admin.test.sql`.

## 5. Secrets and environments (Principle VI)

| File | Check |
|------|-------|
| `apps/web/lib/env.ts`, `env.server.ts`, `apps/mobile/src/lib/env.ts`, `packages/core/src/net.ts` | Service-role key only on the server; https required except for local hosts; app refuses a backend of the other environment (demo ↔ live). |
| `.github/workflows/keep-alive.yml` | Uses only the publishable key via repository secrets. |

## Not needing called-out review

Money arithmetic: R1 only formats and masks amounts (`packages/core/src/money/format.ts`, unit
tested); no stored balances or calculations yet. Sync: none in R1 (the repository interface leaves
it to R2).
