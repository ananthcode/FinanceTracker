# Contract: Sync protocol additions (R7)

Extends R2 ([sync-protocol](../../002-accounts-balances/contracts/sync-protocol.md)), R3 and R4
([sync-protocol](../../004-transactions/contracts/sync-protocol.md)). Shapes are Zod in
`packages/core/src/plan/schemas.ts` and `packages/core/src/sync/schemas.ts`.

## Entities and kinds

| Entity | Kinds |
|--------|-------|
| `plan_item` | `create`, `update`, `delete` |
| `plan_occurrence` | `create`, `update` (a `create` for an existing id merges as an update, R2) |
| `transaction` (R4, extended) | + fields `planItemId`, `planMonth` |

## Plan item fields (camelCase)

| Field | Notes |
|-------|-------|
| `name` | 1–60 chars |
| `target` | `payee` \| `card` \| `person`; create only |
| `payeeId` | Required for `payee` (business) and `person` (person); else absent |
| `categoryId` | Optional for `payee`; else absent |
| `cardAccountId` | Required for `card`; else absent |
| `personAction` | Required for `person`: `lent` \| `repaid_to` \| `paid_on_behalf` |
| `frequency` | `monthly` \| `every_n_months` \| `yearly` \| `one_off` |
| `intervalMonths` | 2–12, only with `every_n_months`; derived otherwise |
| `startMonth`, `endMonth` | `yyyy-MM-01`; `endMonth` nullable |
| `amountVaries` | boolean |
| `terms` | `[{ fromMonth, amountMinor (decimal string or null), dueDay, accountId }]`, one field version |
| `notes` | ≤ 500 chars, nullable |

Server-controlled: `userId`, `state`, timestamps, `fieldVersions`, `serverSeq`.

## Plan occurrence fields

`itemId` (create only), `month` (create only, `yyyy-MM-01`), `amountMinor` (decimal string or null),
`skipped` (boolean). The `entityId` must equal core `occurrenceId(itemId, month)`.

## Transaction fields (added)

`planItemId` (uuid or null), `planMonth` (`yyyy-MM-01` or null): sent together, sharing field version
`plan`. Unlink = both null.

## New rejection codes

| Code | When |
|------|------|
| `INVALID_PLAN_ITEM` | Target fields do not match `target`; an account, card, payee or category that is not the caller's, has the wrong type or kind, or is deleted; terms out of order or not starting at `startMonth` |
| `TERMS_IN_PAST` | An update changes or removes a term entry before the user's current month |
| `HAS_PAYMENTS` | `startMonth` moved after a month that has links |
| `INVALID_OCCURRENCE` | Wrong id derivation; the month is not one the item applies to; the item is deleted |
| `INVALID_PLAN_LINK` | A link to a deleted or foreign item; a month outside its range; a transaction kind that cannot pay a plan item |

Reused: `VALIDATION_FAILED`, `NOT_FOUND`.

## Pull

`rows` gains `plan_item` and `plan_occurrence`; `transaction` rows carry `planItemId` and `planMonth`.
Mobile row mappers learn these fields in this module (R4 lesson), even though the Android screens
come in the Android phase.
