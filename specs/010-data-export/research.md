# Research: Data Export (R10)

Decisions for [plan.md](plan.md). Spec: [spec.md](spec.md) (clarified 2026-11-14: optional backup password,
receipts restored by import, no change history).

## R10-01 Where exports are made: in the browser, from the sync pull

**Decision**: the browser reads the user's records through the existing `/api/sync/pull` (R2; cookie session,
RLS, pages of 500 rows from cursor 0) and `/api/me` (preferences), then builds the file on the device and
downloads it. Attachment files are fetched one by one through `/api/attachments/:id` (R9).

**Rationale**: the web server never holds a whole export (Vercel's 4.5 MB response limit and memory), the
records come through the one read path already reviewed for isolation, and nothing is stored after the
download (FR-017). 20,000 transactions are about 45 pages, inside the pull rate limit (60 a minute).

**Alternatives**: a server route building the file (size limits, memory, a new read path); a database
function returning everything (one huge response).

## R10-02 The backup format (JSON, versioned)

**Decision**: `{ format: "finance-tracker-backup", version: 1, exportedAt, appVersion, preferences, records:
{ account_group, account, category, tag, payee, person_rate, plan_item, plan_occurrence, template,
transaction, attachment } }`. Records are the pull's wire rows (camelCase, money as decimal strings of paise)
for live rows only, without `serverSeq`, `fieldVersions` and `userId`. Two exceptions keep the interest
proposer faithful (R10-05): transactions keep `generated`, `interestMonth`, `userEdited`, and declined
(deleted) interest proposals are kept as `declinedInterest: [{ payeeId, month }]`.
Core owns the Zod schema of the file and a strict reader (unknown `format` or a newer `version` refused).

## R10-03 Excel and CSV: written by core, no new package

**Decision**: core builds the tables (one per record type: names not ids, category paths, dates, rupees) from
the same data, applies the date range (transactions, split lines and attachments only) and writes:
- **CSV**: RFC 4180 (quotes for commas, quotes and line breaks), UTF-8 with a byte-order mark so Excel reads
  it, `yyyy-MM-dd` dates, amounts `1234.50`;
- **XLSX**: a minimal Office Open XML workbook (one worksheet per table, inline strings, numbers, dates as
  serial numbers with a date style, amounts with the user's number format — Indian grouping via a
  conditional custom format);
- **ZIP**: a small writer (stored entries, CRC-32) for the CSV bundle, the XLSX container and backups with
  attachments; a reader for the backup zips the app writes (stored, and deflate through the browser's
  `DecompressionStream`).

Formula safety (FR-005): text starting with `=`, `+`, `-`, `@`, tab or carriage return is prefixed with an
apostrophe in CSV and written as an inline string in XLSX (never a formula).

**Alternatives**: SheetJS (the npm release is old and its maintained builds are not on npm); exceljs (large,
Node-oriented); JSZip / fflate (fine, but a ~100-line writer and reader suffice for stored entries).

## R10-04 Locking a backup (clarify Q1)

**Decision**: Web Crypto in core: PBKDF2-SHA-256 with 600,000 iterations and a 16-byte random salt derives a
256-bit AES-GCM key; the backup JSON (and each attachment file in a zip) is encrypted with its own 12-byte
random IV. The locked file is `{ format: "finance-tracker-backup", version: 1, locked: { kdf, iterations,
salt, iv }, data: <base64> }` (zip entries: `attachments/<n>.bin` encrypted the same way, names inside the
encrypted manifest). A wrong password fails AES-GCM authentication → "The password is not right."
The password is never sent anywhere or stored.

## R10-05 Importing: chunks through the change appliers, all or nothing by reset

**Decision**: the browser validates the whole backup with core (schema, references, the R4 shape rules),
turns it into create changes with fresh ids (as R5's `demoChanges`: every reference remapped, plan months'
deterministic ids recomputed, archived accounts archived, hidden lists hidden) and sends them in order to
`POST /api/me/import` in chunks of up to 1,000:
- `begin` — only into empty data (as R5); records an import session (`private.imports`) and the user's
  device; "reset and import" first runs the R5 reset;
- `chunk` — `app.import_chunk(import_id, changes)` (SECURITY DEFINER, like `_load_demo`): checks the session is
  the caller's and open, applies each change through `app._apply_one` (the same rules as a push), all or
  nothing for the chunk;
- `finish` — `app.import_finish(import_id, marks)`: sets `generated` / `interest_month` / `user_edited` on the
  imported interest proposals and adds the declined-proposal markers (only rows created in this session), closes
  the session and writes one `data_imported` history event with counts;
- `abort` — any refused chunk, or the user cancelling: the R5 reset empties the data again and the session
  closes. An abandoned session (tab closed) is found by Settings ("An import did not finish") and undone the
  same way; until then the Dashboard says so.

**Rationale**: measured 409 demo changes in 1.58 s locally (≈ 4 ms each, history included): a chunk of 1,000
stays inside the 8-second limit for user requests, and every record passes the same checks as typing it
(constitution VIII). Starting from empty data makes "nothing" a reset (FR-012).
**Consequence**: 20,000 transactions take about 80 s — SC-002's import target is set to 2 minutes (export stays
30 s).

**Alternatives**: one request (the 4.5 MB request limit and 8 s timeout); set-based inserts bypassing the
appliers (a second write path to review and keep in step with every rule).

## R10-06 Receipts in a backup (clarify Q2)

**Decision**: with "Include attachments", the backup is a zip: `backup.json` + `attachments/<n>.<ext>`
(locked: encrypted `.bin`). On import, after the transactions, each file is uploaded with the R9 one-time link
for the new transaction and its record pushed in the last chunk. The allowance is checked before `begin`
(sum of sizes ≤ 200 MB) and the user may continue without the files.

## R10-07 History and logs (clarify Q3, FR-016)

**Decision**: exports write `data_exported` (format, counts, range, with or without files, locked or not) through
a small `POST /api/me/export-log`; imports write `data_imported` at `finish`. Imported records get their normal
"created" events (the change context marks them `import`). No contents are logged anywhere.
