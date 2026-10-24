# Contract: Sync protocol (R2 — reused by every later module)

Transport: [http-api.md](http-api.md) (`POST /api/sync/push`, `GET /api/sync/pull`). Server
behaviour: [database.md](database.md) (`app.apply_changes`, `app.pull_changes`). Decisions:
[research R2-01 … R2-04](../research.md). All schemas are Zod in `packages/core/src/sync/` and are
the only accepted shapes (Principle VIII).

## Change

```jsonc
{
  "changeId": "uuid",                 // client-generated, unique per user; idempotency key
  "entity": "account",                // R2: "account" | "account_group"
  "entityId": "uuid",                 // client-generated on create
  "kind": "create",                   // "create" | "update" | "archive" | "restore" | "delete"
  "fields": { "name": "Everyday Savings", "type": "bank", "openingBalanceMinor": "5234050" },
  "hlc": "1793011200000.0003.d7f1c2", // wallMillis.counter.deviceId (zero-padded counter)
  "options": { "onNameConflict": "reject" } // create only: "reject" (web) | "suffix" (sync)
}
```

- Money fields are **decimal strings of integer paise** (`"5234050"`), never JSON numbers —
  floats cannot appear in a sync payload (Principle II).
- Dates are `yyyy-MM-dd` strings; ids are lowercase UUIDs.
- `create` must include every required field; `update` includes only changed fields;
  `archive` / `restore` / `delete` carry no fields.
- A batch holds 1–100 changes, applied in order; the device sends changes in the order they were
  made.

### Fields by entity

| Entity | Writable fields (camelCase on the wire) |
|--------|------------------------------------------|
| `account` | `name`, `type`, `openingBalanceMinor`, `openingBalanceDate`, `colour`, `icon`, `sortKey`, `groupId`, `includeInNetWorth`, `notes`, `creditLimitMinor` |
| `account_group` | `name`, `sortKey` |

`userId`, `currency`, `state`, timestamps, `fieldVersions` and `serverSeq` are server-controlled;
sending them is a validation error.

## Merge rule (per field, latest edit wins — FR-030)

For each field in a change: apply it only if `clamp(change.hlc) > fieldVersions[field]`, where
`clamp` limits the wall-time part to *server receive time + 5 min*; then set
`fieldVersions[field] = clamp(change.hlc)`. Ties compare device id, then change id. Fields not in
the change are untouched. `state` transitions (archive/restore/delete) follow the same rule on
the `state` field, plus the business rules in [data-model.md](../data-model.md#state-transitions).

## Change result

```jsonc
{
  "changeId": "uuid",
  "status": "applied",       // see table
  "appliedFields": ["name"], // fields that won
  "ignoredFields": ["icon"], // fields that lost to a newer edit
  "renamedTo": "Petrol cash (2)",   // only when status = "renamed"
  "code": "BALANCE_NOT_ZERO",       // only when status = "rejected"
  "clamped": false
}
```

| Status | Meaning | Device action |
|--------|---------|---------------|
| `applied` | Change accepted (possibly partially — see `ignoredFields`) | Drop from outbox |
| `duplicate` | Already applied earlier; stored result returned | Drop from outbox |
| `renamed` | Created with a ` (n)` suffix (FR-032) | Drop; tell the user |
| `converted` | Delete turned into archive (FR-034) | Drop; tell the user |
| `rejected` | Business rule refused it (`code`) | Drop; tell the user; next pull restores server state |

Rejection codes: `VALIDATION_FAILED`, `NAME_TAKEN` (web create/rename), `GROUP_NAME_TAKEN`,
`BALANCE_NOT_ZERO`, `HAS_ACTIVITY`, `LIMIT_REACHED`, `DATE_IN_FUTURE`, `NOT_FOUND`.

Two levels of validation: a change that fails the **shape** schema makes the whole push fail with
HTTP `422` and nothing is applied ([http-api.md](http-api.md)); a change that passes the shape but
fails a check only the database can make (group not owned by the caller, colour/icon key not in the
database's allowed list) is `rejected` with `VALIDATION_FAILED`, and the rest of the batch is
applied.

A transport-level failure (network, 5xx, `TRY_LATER`) leaves the whole batch in the outbox for
retry; because results are idempotent, partial server success before the failure is safe.

## Pull

Request `cursor` (opaque string; `"0"` on first sync). Response:

```jsonc
{
  "cursor": "18342",
  "hasMore": false,
  "rows": {
    "account": [ { "id": "…", "name": "…", "state": "active", "fieldVersions": {…}, "serverSeq": "18340", … } ],
    "account_group": [ … ]
  }
}
```

- Rows include deleted ones (so devices remove them) and all fields with server-controlled ones.
- Devices replace their local row with the pulled row unless the outbox still holds an unsent
  change for it; then the pending fields are re-applied locally on top (they will be merged by the
  server on the next push).
- Page size 500 rows; the device repeats while `hasMore`.

## HLC (hybrid logical clock)

`now = max(localWallMillis, lastHlc.wall)`; if `now == lastHlc.wall` then `counter + 1` else
`counter = 0`. After every pull, `lastHlc = max(lastHlc, max(field versions pulled))`. The device
id is a random id created once per installation (web: per browser profile, stored in
`localStorage`; Android: in SecureStore).
