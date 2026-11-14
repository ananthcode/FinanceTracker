# Contract: Export and import (R10)

## Reading for an export (existing endpoints)

- `GET /api/sync/pull?cursor=<n>` (R2) from `0` until `hasMore` is false: every record of the caller (RLS).
- `GET /api/me` (R1): preferences.
- `GET /api/attachments/:id` (R9): each file, when "Include attachments" is ticked.

## HTTP (new)

| Request | Body | Answer |
|---------|------|--------|
| `POST /api/me/export-log` | `{ format: "backup" \| "xlsx" \| "csv", counts, range?: { from, to }, files: boolean, locked: boolean }` | 204; writes `data_exported` |
| `POST /api/me/import` `action: "begin"` | `{ action, reset?: "RESET", counts }` | `{ importId }`; 409 `NOT_EMPTY` (data not empty and no reset); 409 if a session is open |
| `POST /api/me/import` `action: "chunk"` | `{ action, importId, changes: Change[≤ 1000] }` | `{ applied }`; 409 `IMPORT_REJECTED` with `{ index, code }` of the first refused change (the chunk is undone); 409 `IMPORT_NOT_OPEN` |
| `POST /api/me/import` `action: "finish"` | `{ action, importId, interest: { proposals: [{ transactionId, interestMonth, userEdited }], declined: [{ payeeId, month }] } }` | `{ counts }`; writes `data_imported` |
| `POST /api/me/import` `action: "abort"` | `{ action, importId }` | `{ removed }`: the R5 reset; writes `data_import_undone` |
| `GET /api/me/import` | — | `{ open: { importId, startedAt } \| null }` (Settings offers to undo an unfinished import) |

All rate-limited; nothing about the records is logged.

## Database (new)

- `app.import_begin(p_device text, p_counts jsonb) returns uuid` — caller's data empty, no open session.
- `app.import_chunk(p_import uuid, p_changes jsonb) returns jsonb` — open session of the caller; each change
  through `app._apply_one`; any refusal raises (the chunk rolls back) with the index and code.
- `app.import_finish(p_import uuid, p_interest jsonb) returns jsonb` — interest marks only on transactions
  created in this session; closes it; history event.
- `app.import_abort(p_import uuid) returns jsonb` — `_reset_user_data`, closes the session.
- `app.my_open_import() returns jsonb`.

## Core

```ts
// backup
BACKUP_FORMAT, BACKUP_VERSION, BackupFile (Zod), backupFromPull(rows, prefs, now): BackupFile
readBackup(text | bytes, password?): { backup, files? } | { problem }   // format, version, lock, shape
backupProblems(backup): string[]                                         // references, R4 shape rules
backupChanges(backup, { newId, now }): { changes: ChangeInput[]; interest; fileMap }
lockBackup(json, password) / unlockBackup(locked, password)              // Web Crypto, R10-04
// spreadsheets
exportTables(backup, { range, numberFormat }): Table[]
toCsv(table): string; toXlsx(tables, prefs): Uint8Array; zip(entries): Uint8Array; unzip(bytes): Entry[]
exportFileName(kind, today, range?): string
```

## Screens

| Place | Shows |
|-------|-------|
| `/settings` › Your data (R5, extended) | "Export" `#export`: format (Backup, Excel, CSV), range (Excel/CSV), Include attachments (with the size), Lock with a password (backup), Export button, progress `role=status`. "Import a backup" `#import`: file input, password when locked, the contents and Import (or Reset and import with RESET), progress, the report. An unfinished import: "Undo it" |
