# Contract: Sync protocol additions (R3)

Extends [R2's sync protocol](../../002-accounts-balances/contracts/sync-protocol.md); everything
there (change shape, merge rule, HLC, results, pull paging) applies unchanged.

## Entities and kinds

| Entity | Allowed kinds |
|--------|---------------|
| `category` | `create`, `update`, `delete`, `merge` |
| `tag` | `create`, `update`, `delete`, `merge` |
| `payee` | `create`, `update`, `delete`, `merge` |

`archive` / `restore` stay account-only. Hide and unhide are `update` changes of `hidden`.

### Writable fields (camelCase on the wire)

| Entity | Create (required **bold**) | Update |
|--------|-----------------------------|--------|
| `category` | **`name`**, **`kind`**, `parentId`, **`colour`**, **`icon`**, `hidden` | `name`, `parentId`, `colour`, `icon`, `hidden` (`kind` is create-only) |
| `tag` | **`name`** | `name` |
| `payee` | **`name`**, **`kind`**, `defaultCategoryId`, `notes`, `hidden`, `openingBalanceMinor`, `openingBalanceDate`, `includeInNetWorth` | all create fields |

- `openingBalanceMinor` is a decimal string of integer paise, signed: positive = they owe the user.
- For a `person`, `openingBalanceDate` is required on create; for a `business` the three opening
  fields must be absent or zero/`null`/`false` (shape check).
- `merge` carries exactly `{ "targetId": "uuid" }`; `delete` carries no fields.
- Server-controlled (sending them is a validation error): `userId`, `state`, `mergedInto`,
  timestamps, `fieldVersions`, `serverSeq`.

## Merge change

```jsonc
{
  "changeId": "…", "entity": "category", "entityId": "<source id>", "kind": "merge",
  "fields": { "targetId": "<target id>" }, "hlc": "…"
}
```

Applied atomically by the server (research R3-05). The result is `applied` with `appliedFields:
["state"]`; every row the merge touched (moved children, repointed payees, the target's notes or
balance) comes back on the next pull with a new `serverSeq`. A merge whose checks fail is `rejected`
with `INVALID_MERGE`, `NOT_FOUND` (source or target missing or deleted) or `HAS_ACTIVITY` (never in
R3).

## New rejection codes

`HAS_SUBCATEGORIES`, `INVALID_MOVE`, `INVALID_MERGE` (added to `REJECTION_CODES`).

## Pull

`rows` gains `category`, `tag` and `payee` arrays (deleted rows included, with `mergedInto`), in the
same page and cursor as R2's entities. Money fields are decimal strings.
