# Contract: HTTP API additions (R7)

## `PATCH /api/me/preferences` (R1, extended)

Two optional fields; a form sends only what it edits (R3 lesson).

| Field | Type | Rules |
|-------|------|-------|
| `planNudge` | boolean | "Remind me to check next month's plan" |
| `planCheckedMonth` | `yyyy-MM-01` string or null | Marks a month's plan checked. The server stores the later of the stored month and the sent month, so an old device cannot move it back |

`GET /api/me` returns both inside `preferences` (`planNudge: true`, `planCheckedMonth: null` by default).

## Server actions (web only, not public API)

| Action | Input | Output |
|--------|-------|--------|
| `planSuggestions` | `{ kind, accountId, toAccountId?, payeeId?, personAction?, amountMinor, date }` | Unpaid item-months the draft likely pays, best first (core `paysSuggestions`) |
| `linkCandidates` | `{ itemId, month, query? }` | Likely matches first, then a search through R4 `search_transactions` |

Both run with the user's session (RLS); no new route handlers.
