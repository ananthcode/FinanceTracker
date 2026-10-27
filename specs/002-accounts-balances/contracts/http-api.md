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
  token), otherwise `400 VALIDATION_FAILED`.
- Calls `app.apply_changes(changes, device)` with the caller's RLS-scoped client.
- `200 { results: ChangeResult[] }` in the same order as `changes`.
- Errors: `401 UNAUTHENTICATED`, `401 USER_INACTIVE` (R1's code; disabled mid-edit → the device
  signs out, nothing applied), `400 VALIDATION_FAILED` (whole batch rejected when any change fails
  the **shape** check — the Zod schemas in `packages/core/src/sync/schemas.ts`; no partial
  application), `429 TRY_LATER` (> 60 pushes per minute per user).
- Checks that only the database can make — the group belongs to the caller, colour/icon keys match
  the database's allowed lists, the date is not after today in the user's timezone, limits, names,
  balances — never fail the batch: the affected change comes back `rejected` with its code
  (`VALIDATION_FAILED` for the first two) inside the `200` response, and the other changes are
  applied.

### `GET /api/sync/pull?cursor={cursor}` — rows changed since the cursor (Android)

- Auth: user. `200 { cursor, hasMore, rows }` per [sync-protocol.md](sync-protocol.md#pull).
- Query: `cursor` (decimal string, `0` on first sync), optional `limit` 1–500 (default 500).
- Errors: `401 UNAUTHENTICATED`, `401 USER_INACTIVE`, `400 VALIDATION_FAILED` (bad cursor or limit).

### `GET /api/me` (R1, extended)

Response gains `preferences.accountsView: "by_type" | "my_groups"`.

### `PATCH /api/me/preferences` (R1, extended)

Accepts `accountsView`. Same validation and audit as other preferences.

## Web reads (no HTTP endpoint)

The web accounts screen reads `accounts`, `account_groups` and preferences in a server component
through the RLS-scoped Supabase client (`packages/db` repositories `listAccounts`, `listGroups`).
Android reads only from its local store, filled by pull.

## Rate and size limits

- Push: ≤ 100 changes per request (the change schemas also bound every field, so a body stays
  small); ≤ 60 push requests/minute/user (`private.rate_limits`, R1 — it counts requests).
- Pull: ≤ 60 requests/minute/user.
- Invalid bodies answer `400 VALIDATION_FAILED`, as in R1 (converged 2026-10-26; the draft said 422).
