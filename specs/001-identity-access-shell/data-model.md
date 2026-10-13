# Data Model: Identity, Access & App Shell (R1)

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md)

Conventions established here and reused by every later module:

- All tables live in Postgres (Supabase). User-owned tables have `user_id uuid NOT NULL
  REFERENCES auth.users(id) ON DELETE CASCADE` and RLS **enabled with default deny**.
- Every RLS policy on user data includes `app.is_active_user()` (true only for the current user's
  `profiles.status = 'active'`), so disabling a user cuts access on the next request.
- Emails use `citext` (case-insensitive) — FR-005.
- Timestamps are `timestamptz` (UTC); calendar dates (later modules) use `date` — Principle XII.
- Primary keys are `uuid` (client-generatable for future offline creation — Principle IV).
- Schemas: `public` (API-exposed tables), `app` (helper functions), `audit` (trigger functions),
  `private` (server-only tables, not exposed through the Data API).

---

## Entity: Profile — `public.profiles`

One row per user; created by trigger when an auth user is inserted.

| Field | Type | Rules |
|-------|------|-------|
| `user_id` | uuid PK | FK `auth.users(id)` ON DELETE CASCADE |
| `email` | citext | NOT NULL, UNIQUE; copied from auth user |
| `display_name` | text | NULL until setup; 1–50 chars after trim (FR-020) |
| `role` | enum `user_role` (`owner`, `member`) | NOT NULL default `member`; partial unique index `WHERE role = 'owner'` → at most one owner (FR-013) |
| `status` | enum `access_status` (`active`, `disabled`) | NOT NULL default `active` |
| `setup_completed_at` | timestamptz | NULL until first-run setup is done (FR-020) |
| `last_sign_in_at` | timestamptz | Updated on successful sign-in |
| `privacy_notice_shown_at` | timestamptz | Set when joining (FR-036e) |
| `created_at`, `updated_at` | timestamptz | defaults `now()` |

**RLS**
- User: `SELECT`/`UPDATE (display_name, setup_completed_at)` own row only, and only while active.
- Owner-admin: `SELECT (user_id, email, display_name, status, role, last_sign_in_at,
  created_at)` of all rows **via the `app.admin_list_users()` function**, which returns only those
  columns (FR-014, FR-016). No direct cross-user table access.
- `role` and `status` are never updatable by clients; changed only by server-side functions.

**State transitions** — `status`: `active → disabled` (owner action) · `disabled → active` (owner
action) · any → *erased* (row deleted with the auth user). Owner row: no transitions allowed.

---

## Entity: User Preferences — `public.user_preferences`

| Field | Type | Rules |
|-------|------|-------|
| `user_id` | uuid PK | FK `auth.users(id)` ON DELETE CASCADE |
| `base_currency` | char(3) | NOT NULL default `INR`; ISO 4217 check; **immutable once `profiles.setup_completed_at` is set** (trigger) — FR-021 |
| `number_format` | enum (`indian`, `international`) | default `indian` |
| `date_format` | enum (`dd-MMM-yyyy`, `dd/MM/yyyy`, `yyyy-MM-dd`) | default `dd-MMM-yyyy` |
| `fy_start_month` | smallint | 1–12, default 4 (April) |
| `timezone` | text | default `Asia/Kolkata`; must exist in `pg_timezone_names` |
| `updated_at` | timestamptz | |

**RLS**: own row only (`SELECT`, `UPDATE`), active users only. **Audit**: `audit.capture_change()`
trigger records before/after on UPDATE (`preference_changed`).

---

## Entity: Invitation — `public.invitations`

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid PK | |
| `email` | citext | NOT NULL |
| `role` | `user_role` | default `member`; `owner` only via environment bootstrap |
| `token_hash` | bytea | SHA-256 of the emailed token; UNIQUE; the raw token is never stored |
| `status` | enum `invitation_status` (`pending`, `accepted`, `revoked`, `superseded`) | `expired` is **derived**: `status = 'pending' AND expires_at <= now()` |
| `invited_by` | uuid | FK `auth.users(id)` ON DELETE SET NULL |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz | `created_at + 7 days` (FR-003) |
| `accepted_at`, `revoked_at` | timestamptz | |
| `accepted_user_id` | uuid | FK `auth.users(id)` ON DELETE SET NULL |
| `superseded_by` | uuid | FK `invitations(id)` — set on resend |

Partial unique index: one `pending` row per `email`. Column `delivery_status`
(`sent`, `failed`) records email delivery (FR-003b). **On erasure every row for the erased
email is deleted** (FR-016a, SC-009).

**State transitions**

```text
pending ──accept──▶ accepted
   │ ├──revoke──▶ revoked
   │ └──resend──▶ superseded (new pending row created)
   └──(time)──▶ expired (derived; resend allowed)
```

**RLS**: no client access at all (owner reads/writes through server endpoints using the service
role; invitee lookup through `GET /api/invitations/{token}`, which returns only status + masked
email).

---

## Entity: Sign-in Attempt Tracker — `private.sign_in_attempts`

| Field | Type | Rules |
|-------|------|-------|
| `email` | citext PK | |
| `failed_count` | int | reset to 0 on success |
| `first_failed_at` | timestamptz | window start |
| `locked_until` | timestamptz | `now() + 15 min` when `failed_count` reaches 5 (FR-009) |

Not exposed to clients; read/written only by the sign-in endpoint and the Custom Access Token hook.

## Entity: Rate-limit Counter — `private.rate_limits`

| Field | Type | Rules |
|-------|------|-------|
| `bucket` | text PK | e.g. `reset:<sha256(email)>`, `invite-lookup:<sha256(ip)>` — no raw emails/IPs |
| `window_start` | timestamptz | fixed window start |
| `count` | int | requests in window |

Used by public endpoints for FR-008a (3 resets/email/hour; 20 look-ups/address/minute).

## Entity: Environment Identity — `private.environment`

Single row: `name` (`demo`|`live`), set once at environment setup. Returned by `app.health()` so
clients can refuse to run against the wrong backend (FR-019a).

---

## Entity: Audit Event — `public.audit_events` (append-only)

| Field | Type | Rules |
|-------|------|-------|
| `id` | bigint identity PK | |
| `occurred_at` | timestamptz | default `now()` |
| `actor_id` | uuid NULL | user who acted; NULL for system/anonymous |
| `actor_ref` | text NULL | email snapshot, or `erased:<uuid>` after erasure |
| `action` | enum `audit_action` | see list below |
| `target_type` | text | `user`, `invitation`, `preferences`, `session` |
| `target_id` | uuid NULL | |
| `target_ref` | text NULL | email snapshot / `erased:<uuid>` |
| `device_type` | text NULL | `web`, `android` |
| `details` | jsonb | before/after for changes; **never** passwords, PINs, tokens or financial data |

**Actions (FR-037)**: `invitation_created`, `invitation_resent`, `invitation_revoked`,
`invitation_accepted`, `invitation_expired` (recorded lazily when an expired invite is opened or
listed), `invitation_delivery_failed`, `owner_recovered`, `user_disabled`, `user_enabled`, `user_erased`, `sign_in_succeeded`, `sign_in_failed`,
`sign_in_locked`, `password_reset_requested`, `password_reset_completed`, `signed_out`,
`preference_changed`, `setup_completed`, `app_lock_enabled`, `app_lock_disabled`.

**Grants/RLS**: no `UPDATE`/`DELETE` for any client role; `INSERT` only through `SECURITY DEFINER`
functions/triggers. `SELECT`: a user sees their own `sign_in_*`/`signed_out` events (FR-039);
the owner sees invitation and access-change events for everyone via `app.admin_audit_feed()`.
The only modification path is `app.scrub_user_from_audit(user_id)` used by erasure (constitution
III(b)).

---

## Device Settings (on device only — not in the database)

| Setting | Web | Android | Rules |
|---------|-----|---------|-------|
| `hideBalances` | `localStorage` | AsyncStorage | per device (FR-033) |
| `appLock.enabled` | — | SecureStore | Android only |
| `appLock.pinHash`, `appLock.salt` | — | SecureStore | scrypt hash; 4–6 digits (FR-026) |
| `appLock.biometrics` | — | SecureStore | only if device supports strong biometrics |
| `appLock.timeout` | — | SecureStore | `0`, `60`, `300`, `900` seconds |
| `appLock.failedAttempts` | — | SecureStore | 5 → sign out and wipe local data **except the not-yet-sent change queue**, kept sealed and tagged with the user id (FR-028) |
| `appLock.biometricKey` | — | SecureStore (biometric-bound, invalidated on enrolment change) | unreadable → suspend fingerprint unlock until PIN (FR-026b) |
| `keepSignedIn` / `ft_last_active` | cookies | — | R-08 |

---

## Environment (configuration, not data)

`APP_ENV` (`demo`|`live`), Supabase URL + anon key (client), service-role key (server only),
`OWNER_EMAIL`, SMTP settings, `WEB_BASE_URL`, Android application ID per profile. Each environment
is a separate Supabase project, so users, invitations and data never mix (FR-019).

---

## Requirement → model traceability

| Requirement | Where |
|-------------|-------|
| FR-001, FR-003, FR-004 | `invitations` + Before User Created hook |
| FR-005 | `citext` emails, unique `profiles.email` |
| FR-009 | `private.sign_in_attempts` |
| FR-013 | `profiles.role` partial unique index, bootstrap |
| FR-014–FR-016a | `app.admin_list_users()`, server endpoints, `app.scrub_user_from_audit()`, invitation deletion on erase |
| FR-003b | `invitations.delivery_status` |
| FR-008a | `private.rate_limits` |
| FR-019a | `private.environment` + `app.health()` |
| FR-036e | `profiles.privacy_notice_shown_at` |
| FR-017, FR-018 | RLS default deny + `app.is_active_user()` |
| FR-020–FR-025 | `profiles.display_name/setup_completed_at`, `user_preferences` |
| FR-026–FR-033 | Device settings |
| FR-037–FR-039 | `audit_events` |
