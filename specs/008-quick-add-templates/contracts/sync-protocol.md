# Contract: Sync protocol additions (R8)

Extends R2–R7. Shapes are Zod in `packages/core/src/templates/schemas.ts` and
`packages/core/src/sync/schemas.ts`.

## Entity

| Entity | Kinds |
|--------|-------|
| `template` | `create`, `update`, `delete` |

## Template fields (camelCase)

| Field | Notes |
|-------|-------|
| `name` | 1–40 chars |
| `kind` | `expense` \| `income` \| `refund` \| `transfer` \| `person`; create only |
| `accountId`, `toAccountId` | `toAccountId` for transfers only |
| `amountMinor` | decimal string or null; travels with `lines` on update (one version) |
| `payeeId`, `personAction` | as R4; `personAction` not `adjustment` |
| `categoryId`, `lines`, `tagIds`, `notes` | as R4 |
| `planItemId` | uuid or null: the tied planned payment |
| `sortKey` | R2 order key |
| `hidden` | boolean |

Server-controlled: `flow` (derived), `userId`, `state`, timestamps, `fieldVersions`, `serverSeq`.

## Rejection codes

| Code | When |
|------|------|
| `INVALID_TEMPLATE` | Shape per kind broken; a reference not the caller's, deleted or of the wrong kind; split lines not adding up; a tied planned payment that is not the caller's live item or does not fit the template |
| `NAME_TAKEN` (reused) | Another live template has the name |
| `LIMIT_REACHED` (reused) | 100 live templates already |

A recording is an ordinary `transaction` create (R4, with R7 link fields when tied): no new codes.

## Pull

`rows` gains `template`. The mobile row mapper learns it in this module (screens in the Android phase).
