# Quickstart & Validation: Identity, Access & App Shell (R1)

How to run R1 locally and prove each user story works. Details live in
[contracts/](contracts/) and [data-model.md](data-model.md); this guide only runs them.
All examples use synthetic `example.com` addresses.

## Prerequisites (Windows dev machine)

- Node.js 24 LTS, pnpm 10 (`corepack enable`)
- Docker Desktop (for the local Supabase stack) and the Supabase CLI
- Android Studio emulator (API 34+) or an Android phone with USB debugging; Expo dev build
- A Google Cloud OAuth client (web + Android) for Google sign-in testing
- Optional for hosted demo: Supabase Free project, Vercel Hobby project, EAS account, SMTP account

## Local setup

```bash
pnpm install
```

```bash
pnpm supabase start
```

```bash
pnpm db:reset
```

```bash
cp .env.example apps/web/.env.local
```

```bash
cp .env.example apps/mobile/.env.local
```

Each app reads its own `.env.local` (the `env:*` scripts read `apps/web/.env.local`). Fill them
with the local keys printed by `supabase start`, `APP_ENV=demo` and
`OWNER_EMAIL=owner@example.com`; SMTP is Mailpit (`127.0.0.1`, port `54325`). In
`apps/mobile/.env.local` use `http://10.0.2.2:54321` and `http://10.0.2.2:3000` — the Android
emulator's address for this PC.

```bash
pnpm env:bootstrap
```

```bash
pnpm dev
```

`pnpm dev` runs the web app on `http://localhost:3000`; local emails appear in Mailpit
(`http://localhost:54324`). For Android: `pnpm --filter @ft/mobile android` builds and installs
the dev build (needs `ANDROID_HOME`; Expo Go cannot run this app).

**Windows notes.** If `supabase start` fails with "access forbidden" on a 5432x port, Windows has
reserved that range for Hyper-V; from an Administrator PowerShell run `net stop winnat`,
`netsh int ipv4 add excludedportrange protocol=tcp startport=54320 numberofports=10`,
`net start winnat`. If containers come up after a reboot but the ports do not answer, run
`pnpm db:stop` then `pnpm db:start` (data is kept).

## Automated checks

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

Expected: all green. `db:test` runs the pgTAP suite proving the 10 access rules in
[contracts/database.md](contracts/database.md). `e2e` runs Playwright for the web stories (1–5 and 7).
Android component tests run with `pnpm --filter @ft/mobile test`.

## Manual validation by user story

| # | Scenario | Expected |
|---|----------|----------|
| S1-a | Owner opens Mailpit invite, joins with email/password | Lands on `/setup` |
| S1-b | Owner invites `asha.test@example.com`; Asha accepts via email + password | Invitation `accepted`; Asha in `/setup` |
| S1-c | Uninvited `ravi.test@example.com` tries email sign-up and Google | Refused (`INVITE_REQUIRED`); no user created |
| S1-d | Google sign-in with a different email than invited | Refused; invite still pending |
| S1-e | Open revoked / expired / accepted invite link | Correct message per spec; accepted → sign-in |
| S1-f | Android with app installed: tap invite link in phone mail | Opens app at `/invite/…`; without app → web page with install guidance |
| S1-g | Join via Google from an invitation (web and Android) | Privacy notice shown before Google; recorded after setup |
| S1-h | Join with email + password, later sign in with Google using the same email (and vice versa) | Same user id; preferences intact; no second user (FR-005) |
| S2-a | Sign in on web (Keep me signed in ticked) and Android; restart both | Still signed in |
| S2-b | Web without "Keep me signed in"; idle 30 min (or set `IDLE_MINUTES=1` locally) | Signed out after warning |
| S2-c | 5 wrong passwords | 6th attempt `LOCKED`, retry time shown; `sign_in_locked` audited |
| S2-d | Forgot password → Mailpit link → new password | Old password fails; common password rejected |
| S2-e | Sign out on Android | Web session unaffected |
| S3-a | Complete setup with defaults | Preview shows `₹12,34,567.00` and `11-Oct-2026` |
| S3-b | Switch to international grouping | `₹1,234,567.00` everywhere, no restart; base currency read-only |
| S4-a | Admin: revoke pending invite | Link fails immediately |
| S4-b | Admin: disable Asha while she is signed in on web + Android | Within 1 min both are signed out; sign-in refused |
| S4-c | Admin: re-enable Asha | She signs in; her preferences intact |
| S4-d | Admin: erase Asha (type wrong email, then correct email) | Wrong → nothing erased; correct → user gone, audit shows `erased:<id>` only, email re-invitable |
| S4-e | Asha (member) opens `/admin` | Denied |
| S5-a | Visit every nav entry on web + Android | Placeholders; active item highlighted; Demo badge when `APP_ENV=demo` |
| S5-b | Android airplane mode on/off | Offline banner appears/disappears within 5 s |
| S6-a | Enable lock (PIN + fingerprint, 1 min); background 30 s / 2 min | No prompt / prompt |
| S6-b | Fail fingerprint → PIN; 5 wrong PINs | PIN works; 5th wrong → signed out on device; cached data removed (unsent-entry rule verified in R2) |
| S6-c | Recent-apps switcher while lock on; take a screenshot in the app | Preview is blank (Android 13+); screenshot succeeds |
| S7-a | Toggle hide-balances on web | Every amount `₹••••`; persists on reload; Android unaffected |
| PERF-a | Physical Android device: cold-start a signed-in app (lock off); then with lock on, unlock with fingerprint | Home screen < 3 s; < 2 s after fingerprint (SC-004) |
| SEC-a | Request 4 password resets for one email within an hour | Same neutral message each time; only 3 emails in Mailpit |
| SEC-b | Point a demo build at a backend whose environment is `live` | Configuration error screen; app refuses to run |
| SEC-c | Add a new fingerprint on the device while biometric lock is on | Fingerprint unlock suspended until PIN entered |
| SEC-d | Erase a user, then search DB for their email/id | Only the `erased:<id>` erasure record remains |
| SEC-e | Invitation email with SMTP disabled | Admin sees "delivery failed" + resend |

## Security notes (documented residual risks)

- Per-email lockout counts only attempts through `/api/auth/sign-in`; direct Auth API attempts are
  limited by Supabase per-IP rate limits (research R-05).
- A user could set a common password on their own account by calling the Auth API directly
  (research R-04).

## Operations runbook

- **Rotate service-role key or SMTP password**: generate a new value in the provider dashboard →
  update Vercel env vars (and Supabase SMTP settings) → redeploy → revoke the old value. Users stay
  signed in.
- **Session-signing secret suspected compromised**: rotate the project's JWT secret in Supabase →
  every user is signed out on every device and signs in again.
- **Owner-admin lost all sign-in methods**: run `pnpm env:recover-owner --new-email <email>`
  against that environment with the service-role key; accept the new invitation.
- **Demo project paused**: restore it from the Supabase dashboard; check the keep-alive workflow.

## Hosted demo environment (one-time)

1. Create Supabase Free project `finance-tracker-demo`; link and push migrations
   (`pnpm supabase link`, `pnpm supabase db push`); enable the two Auth hooks; set custom SMTP;
   minimum password length 8; Google provider.
2. Create Vercel project (root `apps/web`) with demo env vars.
3. EAS: `eas build --profile demo --platform android` → install APK.
4. Run `pnpm env:bootstrap` against the demo project to invite the owner.
5. Enable the keep-alive GitHub Actions workflow with the demo URL + anon key as secrets.
