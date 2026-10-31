# Contract: HTTP API (R5)

Same route wrapper, CSRF and logging rules as R1–R4. Logs never contain record names or amounts.

## `POST /api/me/data`

Request (strict): `{ "action": "load" | "reset" | "reset_and_load", "confirm"?: "RESET" }`

- `reset` and `reset_and_load` require `confirm: "RESET"` exactly → otherwise `400 VALIDATION_FAILED`.
- `load` and `reset_and_load` only in the demo environment → otherwise
  `403 NOT_AVAILABLE`.
- `load` when the user has data → `409 NOT_EMPTY`.
- Rate limit: 10 a minute per user → `429`.

Response `200`: `{ "action": "...", "loaded"?: { account, account_group, category, tag, payee,
person_rate, transaction }, "removed"?: { accounts, groups, categories, tags, payees, rates,
transactions } }` — counts (loaded by sync entity, removed by table).

## `GET /api/me/data`

`200 { "empty": boolean, "demoAvailable": boolean }` — what the Settings section and Android offer.

## Sync (extended)

- Pull: `reset: true` (see database.md); clients wipe their local copy and pull from 0.
- Push result code `DATA_RESET`: the change was made before the user's data was reset; clients drop it.
