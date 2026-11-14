# Review notes: Data Export (R10)

Code the constitution requires the owner to review explicitly before merge (Development Workflow & Quality
Gates: authorization/RLS, sync, money, privacy). Links are relative to the repository root.

## 1. Import sessions (SECURITY DEFINER)

[20261116000002_exp_import.sql](../../supabase/migrations/20261116000002_exp_import.sql)

- `private.imports`: no client access; at most one open session per user.
- `app.import_begin(device)`: the caller only, active users only; **only into empty data** (`app._user_data_empty`,
  the same rule as the demo load: any row, deleted ones included); a session left open by an import that was
  reset away is closed first.
- `app.import_chunk(import, changes)`: the session must be the caller's and open (`app._my_import`, row lock);
  1–1,000 changes; **each through `app._apply_one`** — the same validation, history and replay memory as a push;
  the first refused change raises `IMPORT_REJECTED:<index>:<code>` and the whole chunk rolls back. Clients send
  500 per request (about 2 s of checks).
- `app.import_finish(import, interest, categoriesStart)`: marks restored interest proposals
  (`generated`, `interest_month`, `user_edited`) **only on the caller's interest rows created since the session
  began** (each must match exactly one row), and adds deleted "declined" markers for the caller's own people,
  as the R4 proposer leaves them; sets `categories_start`; closes the session; one `data_imported` event with
  counts.
- `app.import_abort(import)`: the R5 `_reset_user_data` for the caller, then `data_import_undone` — all or
  nothing (FR-012) because the data was empty at `begin`.
- `app.log_export(...)`: `data_exported` with the format, counts by known record type (whole numbers only),
  range, files and locked flags — no contents.
- Tests: [exp_import.test.sql](../../supabase/tests/exp_import.test.sql) (17).

## 2. Routes

- [`/api/me/import`](../../apps/web/app/api/me/import/route.ts): strict bodies; chunks parsed with the same
  `Change` schema as a push (≤ 500); "begin" with `reset: "RESET"` runs the R5 reset and removes the user's files
  first; "abort" also removes files uploaded during the import. Rate-limited.
- [`/api/me/export-log`](../../apps/web/app/api/me/export-log/route.ts): strict body (format, counts by record
  type, range, two flags). Rate-limited.

## 3. Exports read only through the existing pull (isolation)

[lib/export-client.ts](../../apps/web/lib/export-client.ts): every record comes from `/api/sync/pull` (RLS,
cursor pages) and `/api/me`; attachment files through `/api/attachments/:id` (R9, owner only). Files are built
in the browser and downloaded; **no export is stored on a server**.

## 4. The backup and its lock (core)

- [backup.ts](../../packages/core/src/export/backup.ts): versioned envelope; live records only, without
  `serverSeq`, `fieldVersions`, `userId`; strict reader (unknown format, newer version, damaged parts refused).
- [lock.ts](../../packages/core/src/export/lock.ts): **PBKDF2-SHA-256, 600,000 iterations, 16-byte random salt →
  AES-GCM 256**, a fresh 12-byte IV per piece (the backup JSON and each attachment file). Web Crypto only; the
  password is never sent or stored; a locked zip's file names are numbers (names stay inside the encrypted
  JSON). A wrong password fails the AES-GCM check.
- [changes.ts](../../packages/core/src/export/changes.ts): fresh ids, every reference remapped; a reference to
  something not in the backup is a problem (the import is refused before it starts), except plan links and
  template ties to deleted planned payments, which are dropped; archiving last.

## 5. Spreadsheets and formula safety

- [csv.ts](../../packages/core/src/export/csv.ts): RFC 4180 quoting; text starting with `= + - @`, tab or CR gets
  a leading apostrophe.
- [xlsx.ts](../../packages/core/src/export/xlsx.ts): text is always an inline string, never a formula (`<f>` is
  never written); XML-escaped; characters XML cannot hold removed.
- Money: paise from the records, written as exact decimal text (`rupeesText`), never through floats.

## Decisions taken without asking (inside the agreed scope)

- **Import through chunks of the change appliers, undone by reset** (not one big request, not set-based
  inserts): every record passes the same rules as typing it. Measured ≈ 4 ms a record; SC-002's import target set
  to 2 minutes for 20,000 transactions (export stays 30 s).
- **No new packages**: core writes CSV, XLSX and ZIP itself (SheetJS's npm build is stale; exceljs is large).
- **Only the backup can be imported**; Excel and CSV are for reading.
- **Preferences** come back with the import (number and date formats, financial year, timezone, buffer, plan
  reminder, warranty reminder days); the base currency must match or the import is refused.
- **An import left unfinished** (tab closed) shows in Settings with "Undo the unfinished import".
- Export and import live in a new Settings section, **Export and import**, after Your data.

## Not done here

- Android (US4) — Android phase.
- SC-002 on a production build (the spec `r10-performance` runs with `E2E_PRODUCTION=1`).
