# Contract: Client shell, shared primitives and configuration (R1)

Applies to `apps/web` and `apps/mobile`. Later modules plug into this contract.

## Routes / screens

| Route (both apps unless noted) | Access | Purpose |
|--------------------------------|--------|---------|
| `/sign-in` | public | Google + email/password; web: "Keep me signed in" checkbox |
| `/forgot-password`, `/reset-password` | public / recovery session | FR-008 |
| `/invite/[token]` | public | Accept invitation (App Link on Android) |
| `/setup` | signed in, setup incomplete | First-run setup; every other route redirects here until done |
| `/` (Dashboard), `/accounts`, `/transactions`, `/payment-plan` | signed in | "Coming soon" placeholders in R1 |
| `/settings` | signed in | Preferences, live format preview, sign-in activity, (Android) app lock |
| `/admin` | owner only | Invitations, users, audit feed; hidden from navigation for others |
| `/lock` (Android) | locked state | PIN / biometrics unlock |

## Shell elements

- Navigation: Dashboard · Accounts · Transactions · Payment plan · Settings (+ Admin for owner).
  Web: sidebar ≥ 1024 px, top bar + drawer below; Android: bottom tabs (+ Settings stack).
- **Hide-balances toggle** in the navigation header on every screen (FR-031).
- **Demo marker**: persistent badge when `APP_ENV=demo` (FR-035).
- **Offline banner** (Android): driven by NetInfo, debounced 2 s (FR-036).

## Shared primitives (only path for these concerns)

| Primitive | Package | Contract |
|-----------|---------|----------|
| `formatMoney(minor: bigint, currency: string, prefs)` | `packages/core` | Indian grouping `₹12,34,567.00` / international `₹1,234,567.00`; minus sign + label for negatives; never uses floating point |
| `maskMoney(currency)` | `packages/core` | Returns fixed `₹••••` regardless of value (FR-032) |
| `formatDate(date, prefs)` / `fiscalYearOf(date, startMonth)` | `packages/core` | `dd-MMM-yyyy` etc.; Apr–Mar FY by default |
| `isCommonPassword(pw)` / `passwordPolicy` | `packages/core` | FR-007 |
| `<Money value currency />` | each app | Only component allowed to render amounts; reads per-device `hideBalances` |
| `<DateText value />` | each app | Renders dates via `formatDate` and user prefs |

## Configuration (`.env.example` keys)

| Key | Where | Notes |
|-----|-------|-------|
| `APP_ENV` | web, mobile | `demo` \| `live` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | publishable only |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL` | mobile | publishable only |
| `SUPABASE_SERVICE_ROLE_KEY` | web server only | never `NEXT_PUBLIC_`/`EXPO_PUBLIC_` |
| `OWNER_EMAIL` | bootstrap script | owner designation (FR-013) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | web server + Supabase dashboard | R-02 |
| `WEB_BASE_URL` | web, mobile | invitation links, App Links host |
| `ANDROID_APP_ID`, `ANDROID_CERT_SHA256` | web build | `assetlinks.json` |
| `GOOGLE_OAUTH_CLIENT_ID/SECRET` | Supabase dashboard | not in app code |
