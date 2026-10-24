# Contract: Server HTTP API (R2 additions)

Extends [R1's API contract](../../001-identity-access-shell/contracts/http-api.md): same route
wrapper (auth, CSRF `Origin` / `X-FT-Client: android`, Zod validation, error shape, `errorId`),
same rule that request bodies and logs never carry secrets. **New for R2: logs never contain
change payloads, account names, notes or amounts (FR-028).**

New error codes (added to `ERROR_CODES` in `packages/core`): `NAME_TAKEN`, `GROUP_NAME_TAKEN`,
`BALANCE_NOT_ZERO`, `HAS_ACTIVITY`, `LIMIT_REACHED`, `DATE_IN_FUTURE`. Per-change rejections are
reported inside a `200` push response (see [sync-protocol.md](sync-protocol.md)), not as HTTP
errors.

## Authenticated user

### `POST /api/sync/push` — apply a batch of changes (web writes and Android sync)

- Auth: user (cookie on web, bearer on Android). Body: `{ device: "web" | "android", changes: Change[] }`
  (1–100, [sync-protocol.md](sync-protocol.md)).
- `device` must match how the request authenticated (`web` with cookies, `android` with a bearer
  token), otherwise `422 VALIDATION_FAILED`.
- Calls `app.apply_changes(changes, device)` with the caller's RLS-scoped client.
- `200 { results: ChangeResult[] }` in the same order as `changes`.
- Errors: `401 UNAUTHENTICATED`, `403 USER_INACTIVE` (disabled mid-edit → device signs out,
  nothing applied), `422 VALIDATION_FAILED` (whole batch rejected when any change fails schema
  validation — no partial application), `429 TRY_LATER` (> 120 changes per minute per user).

### `GET /api/sync/pull?cursor={cursor}` — rows changed since the cursor (Android)

- Auth: user. `200 { cursor, hasMore, rows }` per [sync-protocol.md](sync-protocol.md#pull).
- Errors: `401`, `403 USER_INACTIVE`, `422 VALIDATION_FAILED` (bad cursor).

### `GET /api/me` (R1, extended)

Response gains `preferences.accountsView: "by_type" | "my_groups"`.

### `PATCH /api/me/preferences` (R1, extended)

Accepts `accountsView`. Same validation and audit as other preferences.

## Web reads (no HTTP endpoint)

The web accounts screen reads `accounts`, `account_groups` and preferences in a server component
through the RLS-scoped Supabase client (`packages/db` repositories `listAccounts`, `listGroups`).
Android reads only from its local store, filled by pull.

## Rate and size limits

- Push body ≤ 256 KB; ≤ 100 changes; ≤ 120 changes/minute/user (`private.rate_limits`, R1).
- Pull: ≤ 60 requests/minute/user.
