# Deploying `main` to the hosted demo environment

Checklist for the person operating the **demo** environment (synthetic data, testers). It expands
the one-time steps in
[specs/001-identity-access-shell/quickstart.md](../specs/001-identity-access-shell/quickstart.md)
§"Hosted demo environment" and follows constitution principles V (no real personal data) and VI
(secrets and per-environment configuration).

Conventions used below:

- All values are **placeholders**. Real values live only in the Supabase / Vercel / EAS / GitHub
  dashboards — never in this repository, never in a commit, never in a PR or issue.
- `demo.example.com` stands for the demo web URL, `<project-ref>` for the Supabase project ref,
  `owner@example.com` for the owner-admin email.
- **To confirm** marks anything that cannot be verified from the repository.
- **[APPROVAL]** marks a step that changes a hosted system and needs the owner's explicit go-ahead.

## 0. Before you start

- [ ] `main` is green in CI (`checks`, `database`, `e2e` jobs in `.github/workflows/ci.yml`).
- [ ] Note the commit SHA being deployed (needed for rollback).
- [ ] Tools: Node per `.nvmrc`, pnpm 10, Supabase CLI (repo dev dependency, `pnpm supabase`),
      Vercel dashboard access, EAS CLI (`>= 16.0.0` per `apps/mobile/eas.json`) for Android.
- [ ] Accounts: Supabase Free project, Vercel Hobby project, Expo/EAS account, SMTP provider
      (no Google Cloud OAuth client needed: Google sign-in is not used for the demo).
- [ ] Decide whether this is the **first** deploy (do everything) or a **re-deploy** (sections 2,
      4 and 8 only, plus any new env vars).

## 1. Supabase project (first deploy only)

1. [ ] **[APPROVAL]** Create Supabase Free project (suggested name `finance-tracker-demo`).
       Region: **Mumbai (ap-south-1)** — owner decision 2026-10-31; set the Vercel function
       region to **bom1** to match. Store the database password in a password manager.
2. [ ] Collect from the dashboard (Project Settings › API) — keep them out of the repo:
       project URL `https://<project-ref>.supabase.co`, anon (publishable) key, service-role key.

## 2. Database schema

1. [ ] Link the local CLI to the hosted project:
       ```
       pnpm supabase link --project-ref <project-ref>
       ```
2. [ ] Preview what will be applied:
       ```
       pnpm supabase migration list
       pnpm supabase db push --dry-run
       ```
3. [ ] **[APPROVAL]** Apply the migrations in `supabase/migrations/`:
       ```
       pnpm supabase db push
       ```
       Migrations are forward-only; there are no down migrations in the repo (see Rollback).
4. [ ] Never run `supabase db reset` against the hosted project, and never load `supabase/seed.sql`
       there unless it is confirmed synthetic and intended (to confirm).

## 3. Supabase Auth configuration (first deploy; re-check after upgrades)

`supabase/config.toml` configures only the **local** stack; `db push` does not copy these settings
to the hosted project. Set them in the dashboard (Authentication) to match. Whether to instead use
`supabase config push` is **to confirm**.

- [ ] **Auth hooks** (Authentication › Hooks), both Postgres functions:
  - Before user created → `app.hook_before_user_created` (invite-only sign-up)
  - Custom access token → `app.hook_custom_access_token` (refuse disabled/locked users)
- [ ] **Email provider** enabled; email confirmations **off** (local `enable_confirmations = false`;
      to confirm for hosted); minimum password length **8**.
- [ ] **Google provider**: **not used for the demo** (owner decision 2026-10-31) — leave it
      disabled; testers sign in with email and password. To add it later: enable it with the Google
      OAuth client ID and secret (stored only in the Supabase dashboard), authorised redirect URI
      `https://<project-ref>.supabase.co/auth/v1/callback`, consent screen in testing mode with the
      testers listed.
- [ ] **Custom SMTP** (Authentication › SMTP): host, port, user, password, sender
      `Finance Tracker <no-reply@example.com>`. Same values as the Vercel `SMTP_*` variables.
      Rate limit for emails (local allows 3 password-reset emails per hour per address, test
      SEC-a): **to confirm**.
- [ ] **URL configuration**:
  - Site URL: `https://demo.example.com`
  - Redirect URLs (mirror local `additional_redirect_urls`):
    `https://demo.example.com/auth/callback`, `https://demo.example.com/reset-password`,
    `financetracker://**`. (`exp://**` is only for Expo Go in development — omit on hosted demo
    unless testers use Expo Go: to confirm.)
- [ ] Email templates (recovery, invite) match local templates if customised: **to confirm**.

## 4. Vercel (web)

1. [ ] **[APPROVAL]** (first deploy) Create a Vercel project from the GitHub repo with **Root
       Directory `apps/web`**. No `vercel.json` exists in the repo; framework preset Next.js,
       install/build commands default (pnpm workspace detection): **to confirm**. Node version per
       `.nvmrc` (24).
2. [ ] Environment variables (Production environment of the demo project). Placeholders only:

   | Name | Placeholder | Notes |
   |---|---|---|
   | `APP_ENV` | `demo` | |
   | `NEXT_PUBLIC_APP_ENV` | `demo` | Inlined at build time — redeploy after changing |
   | `WEB_BASE_URL` | `https://demo.example.com` | Used in invitation links |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Build-time |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<anon-key>` | Publishable; build-time |
   | `SUPABASE_SERVICE_ROLE_KEY` | `<service-role-key>` | **Secret**, server only, mark Sensitive |
   | `SMTP_HOST` | `smtp.example.com` | |
   | `SMTP_PORT` | `587` | to confirm with provider |
   | `SMTP_USER` | `<smtp-user>` | |
   | `SMTP_PASS` | `<smtp-password>` | **Secret** |
   | `SMTP_FROM` | `Finance Tracker <no-reply@example.com>` | |
   | `OWNER_EMAIL` | `owner@example.com` | Needed by web at runtime? to confirm (used by `scripts/env-bootstrap.ts`) |
   | `ANDROID_APP_ID` | `com.example.financetracker.demo` | Must equal the demo app's package (see §5) |
   | `ANDROID_CERT_SHA256` | `AA:BB:...` | SHA-256 of the EAS demo signing cert; served in `/.well-known/assetlinks.json` |

   Do **not** set `IDLE_MINUTES` (local testing only) or `E2E_PRODUCTION`.
   The build fails ("Failed to collect page data") if the `NEXT_PUBLIC_*` values are missing.
3. [ ] **[APPROVAL]** Deploy the chosen `main` commit (production deployment). Address: the free
       `<project>.vercel.app` domain, no custom domain (owner decision 2026-10-31). Everywhere this
       checklist says `https://demo.example.com`, use that address.
4. [ ] Production branch = `main` with **automatic deploys off** (owner decision 2026-10-31): in
       Project Settings › Git, turn off auto-deploy of production (or set an Ignored Build Step
       that exits 0) and promote builds by hand, so migrations (§2) are applied before the code
       that needs them.

## 5. Android (EAS `demo` profile)

- [ ] `apps/mobile/eas.json` profile `demo`: internal distribution, APK, `EXPO_PUBLIC_APP_ENV=demo`.
- [ ] Set EAS environment variables / secrets for the demo build (placeholders):
      `EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`,
      `EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>`,
      `EXPO_PUBLIC_API_BASE_URL=https://demo.example.com`.
      `EXPO_PUBLIC_API_BASE_URL` must be `https://` — `app.config.ts` only adds the verified
      `/invite/` App Link intent filter for an https host. Whether these are set as EAS env vars
      or in the `demo` profile's `env` block: **to confirm** (do not commit real values).
- [ ] The demo package ID comes from `apps/mobile/app.config.ts` (`<base-id>.demo`); set Vercel
      `ANDROID_APP_ID` to exactly that value.
- [ ] **[APPROVAL]** Build: `eas build --profile demo --platform android`.
- [ ] Copy the signing certificate SHA-256 (`eas credentials`) into Vercel
      `ANDROID_CERT_SHA256`, redeploy web, then check
      `https://demo.example.com/.well-known/assetlinks.json` returns it.
- [ ] Share the APK link with testers only (internal distribution).

## 6. Owner bootstrap (first deploy only)

- [ ] **[APPROVAL]** Run once against the demo project from a machine holding the values in a
      git-ignored env file (the script reads `apps/web/.env.local` if present, or the shell env):
      ```
      APP_ENV=demo NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
      SUPABASE_SERVICE_ROLE_KEY=<service-role-key> OWNER_EMAIL=owner@example.com \
      WEB_BASE_URL=https://demo.example.com SMTP_HOST=... SMTP_PORT=... SMTP_USER=... \
      SMTP_PASS=... SMTP_FROM=... pnpm env:bootstrap
      ```
      It records the environment name (`demo`; refuses if the DB belongs to another
      environment) and emails a single owner-admin invitation. It is a no-op if an owner exists.
      Make sure a local `apps/web/.env.local` pointing at the local stack does not override
      these values.
- [ ] Owner accepts the invitation and completes setup.
- [ ] Lost owner access later: `pnpm env:recover-owner --new-email <email>` (runbook).

## 7. Keep-awake workflow

Supabase Free projects pause after 7 days idle; `.github/workflows/keep-alive.yml` calls
`app.health()` daily (03:17 UTC) and is a no-op until its secrets exist.

- [ ] **[APPROVAL]** Add repository secrets `DEMO_SUPABASE_URL` and `DEMO_SUPABASE_ANON_KEY`
      (anon key only — never the service-role key).
- [ ] Run it once manually (Actions › "Keep demo backend awake" › Run workflow); expect HTTP 200.

## 8. Post-deploy smoke checks (on `https://demo.example.com` and the demo APK)

Use synthetic data only (e.g. tester `asha@example.com`).

- [ ] Home page shows the **Demo** badge; no configuration-error screen.
- [ ] **Sign-in**: email + password; forgot password email arrives via SMTP;
      wrong password 5 times locks (optional).
- [ ] **Invite**: owner invites a tester; email arrives; link opens the app on Android (App Link)
      or the web page otherwise; tester completes setup.
- [ ] **Accounts**: create, edit, archive/restore an account; balances and net worth look right.
- [ ] **Categories start choice**: a new user opening Settings › Categories sees the start choice
      with "Start with suggested categories" preselected; accepting shows Expense and Income trees.
- [ ] **People**: add a person with an opening balance; People totals show it; "Include in net
      worth" changes the Accounts net worth.
- [ ] Hide-balances masks amounts; Android airplane mode shows the offline banner and queues edits.
- [ ] Vercel function logs and Supabase logs show no errors.
- [ ] Keep-awake workflow's next scheduled run succeeds.

## 9. Rollback notes

- **Web**: in Vercel, promote/redeploy the previous production deployment (instant rollback).
  Works only if the previous build is compatible with the current schema.
- **Database**: migrations are forward-only. To undo, write and push a new corrective migration,
  or restore from a Supabase backup (Free-plan backup/PITR availability: **to confirm**). Demo data
  is synthetic, so a full rebuild (new project → `db push` → bootstrap) is an acceptable last
  resort.
- **Android**: testers reinstall the previous APK from the EAS build list. A demo APK must not be
  pointed at a `live` backend (the app refuses: SEC-b).
- **Secrets leaked**: rotate in the provider dashboard → update Vercel/EAS/GitHub → redeploy →
  revoke the old value (quickstart operations runbook).
- **Project paused**: restore from the Supabase dashboard; check the keep-awake workflow.

## 10. Steps that need the owner's approval

1. Creating the Supabase demo project and choosing its region.
2. `supabase db push` to the hosted project (each deploy that includes new migrations).
3. Changing hosted Auth settings: hooks, providers (Google client), SMTP, site/redirect URLs.
4. Creating the Vercel project, setting/changing env vars, and each production deploy/rollback.
5. Running EAS builds and distributing the APK.
6. Running `pnpm env:bootstrap` / `pnpm env:recover-owner` against the hosted project.
7. Adding GitHub repository secrets for the keep-awake workflow.
8. Any restore from backup, project rebuild, or secret rotation.

## Decided (2026-10-31)

- Supabase region Mumbai (ap-south-1); Vercel functions in bom1.
- Address: free `vercel.app` domain, no custom domain.
- No automatic production deploys; builds are promoted by hand after migrations.
- No Google sign-in for the demo (email and password only).

## Open items (to confirm)

- Whether `supabase config push` is used instead of manual dashboard settings.
- Hosted email-confirmation setting, email rate limits and custom templates.
- Vercel build settings for the pnpm monorepo.
- Whether web needs `OWNER_EMAIL` at runtime.
- SMTP provider and port.
- Where the EAS `EXPO_PUBLIC_*` values are kept (EAS env vars vs profile `env`).
- Whether `exp://**` belongs in hosted redirect URLs.
- Supabase Free-plan backup availability for rollback.
