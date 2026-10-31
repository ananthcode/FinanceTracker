# Contract: Server HTTP API (R4 additions)

Same route wrapper and logging rules as R1–R3. **Logs never contain amounts, notes, references,
payee or category names (FR-022).**

| Route | Behaviour |
|-------|-----------|
| `POST /api/sync/push`, `GET /api/sync/pull` | Accept and return the R4 entities and `relocate` |
| `POST /api/interest/propose` | Calls `app.propose_interest()`; `200 { changed }`; rate limit 30/min/user. The web calls it from the signed-in layout at most once per page load |

## Web reads (no HTTP endpoint)

Server components call `app.search_transactions` and `app.to_confirm_count` and read `person_rates`
through the RLS-scoped client (`packages/db` repositories `searchTransactions`, `getTransaction`,
`toConfirmCount`, `listPersonRates`). The list's "Load more" is a server action that calls the same
repository with the next keyset cursor.
