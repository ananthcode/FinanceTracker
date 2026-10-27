# Contract: Server HTTP API (R3 additions)

Extends R1's and [R2's API contract](../../002-accounts-balances/contracts/http-api.md): same route
wrapper (auth, CSRF, Zod, error shape), same rule that logs carry no payloads. **Logs never contain
category, tag or payee names, notes or person balances (FR-029).**

## `POST /api/sync/push` and `GET /api/sync/pull` (R2, extended)

Accept and return the R3 entities ([sync-protocol.md](sync-protocol.md)). No other change.

## `POST /api/categories/start`

- Auth: user (cookie on web, bearer on Android). Body: `{ choice: "suggested" | "empty" }`.
- Calls `app.start_categories(choice, DEFAULT_CATEGORIES)` with the caller's client; the default list
  comes from `packages/core`, never from the request.
- `200 { choice: "suggested" | "empty", added: number }` — `choice` is the stored first answer,
  which may differ from the request when another device answered first; `added` is 0 when the user
  already had categories.
- Errors: `401 UNAUTHENTICATED`, `401 USER_INACTIVE`, `400 VALIDATION_FAILED`, `429 TRY_LATER`
  (> 10 requests per minute per user).

## `GET /api/me` and `PATCH /api/me/preferences` (R1)

`GET` gains `preferences.categoriesStart: "suggested" | "empty" | null`. It is **not** accepted by
`PATCH` (only `start_categories` sets it).

## Web reads (no HTTP endpoint)

Server components read categories, tags and payees through the RLS-scoped client
(`packages/db` repositories `listCategories`, `listTags`, `listPayees`), money columns as text.
