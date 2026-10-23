# Contract: Server HTTP API (R1)

Served by `apps/web` route handlers at `${WEB_BASE_URL}/api/...`; used by both web and Android.
Request/response bodies are JSON validated with Zod schemas exported from `packages/core`
(schema names in brackets). Errors use one shape:

```json
{ "error": { "code": "INVITE_EXPIRED", "message": "This invitation is no longer valid." } }
```

Auth: `Authorization: Bearer <user access token>` (Android) or Supabase auth cookies (web).
"Owner" = caller's profile has `role = 'owner'` and `status = 'active'`; otherwise `403 FORBIDDEN`.
Disabled callers get `401 USER_INACTIVE` on every authenticated endpoint (clients sign out).

---

## Public (no session)

### `GET /api/invitations/{token}` — look up an invitation
→ `200 [InvitationLookup]` `{ status: "pending"|"accepted"|"expired"|"revoked", emailMasked: "a***@example.com", expiresAt }`
→ `404 INVITE_NOT_FOUND` (also used for superseded tokens) · `429 TRY_LATER` (> 20 look-ups/min
from one address, FR-008a).
Records `invitation_expired` the first time an expired invitation is looked up.

### `POST /api/invitations/{token}/accept` — join with email + password (Story 1)
Body `[AcceptInvitationRequest]` `{ email, password, keepSignedIn, device: "web"|"android" }`
- Validates token pending + unexpired, `email` equals invited email (case-insensitive),
  password policy (min 8, not in the 10,000-common list, not equal to the email's local part).
- Body also carries `privacyNoticeShown: true` (FR-036e); stored on the profile.
- Creates the auth user (email confirmed) → Before User Created hook re-validates → trigger creates
  profile + preferences and marks the invitation accepted.
→ `201 [SessionResponse]` `{ accessToken, refreshToken, expiresAt, user: { id, email, setupComplete: false } }` (web: cookies set instead of tokens)
→ `409 ALREADY_ACCEPTED` · `410 INVITE_EXPIRED` · `410 INVITE_REVOKED` · `422 EMAIL_MISMATCH` · `422 WEAK_PASSWORD`

Google path: the client starts Supabase OAuth; the hook enforces the invitation; no endpoint call.
Mismatched/uninvited Google emails fail with the hook message `INVITE_REQUIRED`.

### `POST /api/auth/sign-in` — email + password (Story 2)
Body `[PasswordSignInRequest]` `{ email, password, keepSignedIn, device }`
→ `200 [SessionResponse]` · `401 INVALID_CREDENTIALS` · `423 LOCKED { retryAfter }` (FR-009) ·
`401 USER_INACTIVE`. Writes `sign_in_succeeded` / `sign_in_failed` / `sign_in_locked`.

### `POST /api/auth/password-reset` — request reset link
Body `{ email }` → always `202` with the same neutral message (FR-008), including when the
per-email limit (3/hour, FR-008a) is reached — no email is sent then. Reset links are single-use
and valid for 1 hour (Auth setting). Triggers Supabase reset email via custom SMTP. Writes `password_reset_requested` (actor unknown → email hashed in details).

### `POST /api/auth/password-reset/complete` — set new password
Requires the recovery session from the reset link. Body `{ password }` → `204` · `422 WEAK_PASSWORD`.
Ends all other sessions on every device; the current session stays (FR-010). Writes `password_reset_completed`.

---

## Authenticated user

### `POST /api/auth/sign-out`
Body `{ device }` → `204`. Ends the current session only (FR-011). Writes `signed_out`.

### `POST /api/me/setup` — first-run setup (Story 3)
Body `[SetupRequest]` `{ displayName, baseCurrency, numberFormat, dateFormat, fyStartMonth, timezone, privacyNoticeShown }`
(`privacyNoticeShown: true` is required when the profile has no record of it yet — the Google join
path — FR-036e; `422 PRIVACY_NOTICE_REQUIRED` otherwise)
→ `200 [MeResponse]` · `409 SETUP_ALREADY_COMPLETE`. Writes `setup_completed`.

### `GET /api/me` → `200 [MeResponse]`
`{ id, email, displayName, role, setupComplete, preferences: {...}, environment: "demo"|"live" }`

### `PATCH /api/me/preferences`
Body `[PreferencesUpdate]` (any of displayName, numberFormat, dateFormat, fyStartMonth, timezone;
**baseCurrency rejected** with `422 BASE_CURRENCY_LOCKED`) → `200 [MeResponse]`.

### `GET /api/me/sign-in-activity?limit=20` → `200` list of `{ occurredAt, action, method, deviceType }` (FR-039)

### `GET /api/auth/ping` → `204`
"Stay signed in" from the web idle warning; the proxy refreshes the last-activity marker (FR-010).

### `POST /api/me/audit` — device-side events *(arrives with US6, deferred)*
Body `{ action: "app_lock_enabled"|"app_lock_disabled", device: "android" }` → `204`.

---

## Owner-admin only (Story 4)

| Method & path | Body | Success | Errors |
|---------------|------|---------|--------|
| `GET /api/admin/overview` | — | `200 { invitations: [{ id, email, status, createdAt, expiresAt }], users: [{ id, email, displayName, status, role, lastSignInAt }] }` — no other fields (FR-014/016) | `403` |
| `POST /api/admin/invitations` | `{ email }` | `201 { id, expiresAt, deliveryStatus: "sent"\|"failed" }` (FR-003b; never returns the token) | `409 USER_EXISTS` · `409 INVITE_PENDING` (use resend) · `422 INVALID_EMAIL` |
| `POST /api/admin/invitations/{id}/resend` | — | `201 { id, expiresAt }` new row; old → superseded | `409 NOT_RESENDABLE` (accepted/revoked) |
| `POST /api/admin/invitations/{id}/revoke` | — | `204` | `409 NOT_PENDING` |
| `POST /api/admin/users/{id}/disable` | — | `204` | `409 CANNOT_TARGET_OWNER` |
| `POST /api/admin/users/{id}/enable` | — | `204` | `409 NOT_DISABLED` |
| `POST /api/admin/users/{id}/erase` | `{ confirmEmail }` | `204` | `409 CANNOT_TARGET_OWNER` · `422 CONFIRMATION_MISMATCH` |
| `GET /api/admin/audit?cursor=` | — | `200` invitation/access events (actor/target refs, action, time) | `403` |

All admin mutations write the matching audit action. Erase performs: scrub audit identifiers →
delete all invitations for the email → write `user_erased` → delete auth user (cascade) — and
never returns user data.

## Cross-cutting rules (FR-036a/b/d)

- HTTPS only (platform-enforced on Vercel and Supabase); HTTP redirected.
- Web auth cookies: `HttpOnly`, `Secure`, `SameSite=Lax`; every state-changing route checks the
  `Origin` header against `WEB_BASE_URL` (CSRF) — bearer-token calls from Android are exempt.
- Error responses include `errorId`; server logs record `errorId`, route and error class only —
  never emails, tokens, passwords or amounts.

---

## Web browser routes (redirects, not JSON)

The session these create lives only in HttpOnly cookies (FR-036b). Every `next` parameter is
accepted only as a same-site path (starts with `/`, not `//`) — no open redirects.

| Route | Purpose | Outcome |
|-------|---------|---------|
| `GET /auth/google?next=&keep=1` | Starts Google sign-in with PKCE; remembers "Keep me signed in" | Redirect to Google, or `/sign-in?error=oauth` |
| `GET /auth/callback?code=&next=` | Exchanges the code; records `sign_in_succeeded` (method google, device web). Invitation and verified-email rules were already enforced by the Supabase hooks | Redirect to `next`, or `/sign-in?error=invite_required` · `inactive` · `oauth` |
| `GET /auth/confirm?token_hash=&type=recovery&next=` | Verifies the password-reset email link on the server (works in any browser) | Redirect to `next` (the new-password form), or `/forgot-password?error=link` (used, expired or wrong type) |
| Signed-in pages when the backend cannot be reached | The proxy and signed-in layout never sign the user out for an outage | Redirect to `/unavailable` |

## Static

### `GET /.well-known/assetlinks.json`
Android App Links verification for the environment's application ID and signing certificate
fingerprint (R-03). Generated from env vars at build time.
