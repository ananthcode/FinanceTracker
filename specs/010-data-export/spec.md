# Feature Specification: Data Export

**Feature Branch**: `010-data-export`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "R10 Data export (roadmap row R10, depends on R4; R9 for attachments): user-initiated
full export of the user's own data to Excel (one sheet per record type), CSV (a zip of one file per record
type) and JSON (complete, versioned, re-importable into the app); export by date range or everything; amounts
in rupees with the user's number format in Excel/CSV and exact paise in JSON; attachments included as files in
the export when asked (R9); JSON import restores into empty data (as the demo load does) with validation and a
clear report; nothing about the user's data is logged. Web first; Android in the Android phase."

## Clarifications

### Session 2026-11-14

- Q: Should the backup file be protected with a password? → A: Optional: the user may lock a backup with a password typed at export; the same password is needed to import it; a lost password cannot be recovered. Excel and CSV exports are not locked.
- Q: When a backup includes receipt files, should importing it put the files back too? → A: Yes: a backup may include the attachment files, and importing it stores them again and links them to their transactions, within the 200 MB allowance.
- Q: Should exports include the change history? → A: No: exports hold the user's records only; after an import the history starts fresh ("imported from a backup").

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export everything as a backup and bring it back (Priority: P1)

The user downloads a complete copy of their data — accounts, people, categories, payees, tags, transactions,
interest rates, the payment plan, quick-add templates, warranties and preferences — as one backup file they
keep. On a fresh start (after a reset, or on a new account) they import that file and get exactly the same
data back.

**Why this priority**: A personal finance record built over years must not depend on one app or one
database; a backup the user holds is the core promise of the module (constitution: users can export all
their data).

**Independent Test**: Load the demo household, export a backup, reset, import the backup; every balance,
person balance, report total, plan month and template is the same as before.

**Acceptance Scenarios**:

1. **Given** the user's data, **When** they choose Settings › Your data › Export › Backup (JSON), **Then** a
   single file downloads named with the app, the user's choice and today's date, containing every record
   of theirs, with a format version and the export date.
2. **Given** a backup and empty data, **When** the user imports it, **Then** they see what it contains (counts
   by type, the export date) and confirm; afterwards every record is back, balances and report totals match
   the moment of export exactly, and a report says what was restored.
3. **Given** a backup and data that is not empty, **When** the user tries to import, **Then** they are told to
   reset first (or to reset and import in one step, after typing RESET), and nothing changes.
4. **Given** a file that is not a backup of this app, is damaged, is from a newer format version, or contains
   records that break the app's rules, **When** the user imports it, **Then** nothing is imported and the
   report says what is wrong (the first problems, in words).
5. **Given** a backup locked with a password, **When** the user imports it, **Then** they are asked for the
   password; a wrong one is refused and nothing changes.
6. **Given** a backup made by another user of the app, **When** it is imported, **Then** it becomes the
   importing user's own data (no link to the other user remains).

---

### User Story 2 - Open my data in a spreadsheet (Priority: P1)

The user wants their transactions in Excel (or any spreadsheet) to analyse them their own way or share with an
accountant: one sheet per record type, readable column names, dates and amounts as a spreadsheet understands
them.

**Why this priority**: The most common reason to export is "look at it in Excel".

**Independent Test**: Export the demo household to Excel; the Transactions sheet has one row per transaction
(split lines as their own rows), with account, payee, category path, tags, amounts that add up to the
Reports totals for the same period.

**Acceptance Scenarios**:

1. **Given** the user's data, **When** they export to Excel, **Then** one workbook downloads with a sheet per
   record type (Accounts, People & payees, Categories, Tags, Transactions, Split lines, Interest rates,
   Payment plan, Templates, Attachments), each with a header row, names instead of internal ids, dates as
   dates and amounts as numbers in rupees (two decimals) formatted in the user's number format.
2. **Given** the user prefers plain files, **When** they export to CSV, **Then** one zip downloads with a CSV
   file per record type (the same columns as the sheets), dates as `yyyy-MM-dd`, amounts as plain numbers with
   a dot and two decimals, UTF-8 text that opens correctly in Excel.
3. **Given** a date range ("This financial year", "Last month", a custom range or Everything), **When** the
   user exports to Excel or CSV, **Then** only transactions (and their split lines and attachments) dated in
   that range are included; the lists (accounts, categories, payees, tags, plan) are always complete; the
   file says the range.
4. **Given** hide-balances is on, **When** the user exports, **Then** the export still contains the amounts
   (hide-balances is for the screen; the export is the user's own deliberate action), and the screen says so.

---

### User Story 3 - Include my receipts (Priority: P2)

The user's backup or spreadsheet export can include the attachment files (receipts, PDFs), so the copy they keep
is complete.

**Why this priority**: Receipts matter for warranties and claims, but they make exports large; optional.

**Independent Test**: With two attachments, export a backup with "Include attachments" ticked; the download
contains both files, named so they can be matched to their transactions; importing it restores the files too.

**Acceptance Scenarios**:

1. **Given** attachments, **When** the user ticks "Include attachments" and exports, **Then** the download is a
   zip with the data file(s) and an `attachments` folder holding each file, named by date, item and original
   name; the export shows the total size before it starts.
2. **Given** a backup with attachments, **When** it is imported into empty data, **Then** the files are stored
   again (within the user's allowance) and linked to their transactions.
3. **Given** "Include attachments" is not ticked, **Then** the export lists the attachments (name, size,
   transaction) without the files.

---

### User Story 4 - Export and import on Android (Priority: P3, Android phase)

Export to a file and share it from the phone; import a backup on the phone.

**Why this priority**: Web first by the project's build order.

**Independent Test**: Deferred to the Android phase.

---

### Edge Cases

- Empty data: export still works (sheets with headers only; an empty backup); importing an empty backup
  restores nothing and says so.
- Large data (20,000 transactions, the R4 performance size): the export completes and downloads within the
  success criteria without freezing the screen; progress is shown.
- Archived accounts, hidden categories and payees, deleted records: archived and hidden ones are exported
  (marked as such) and restored as archived / hidden; deleted records are not exported.
- Upcoming and to-confirm transactions, voided ones and interest proposals are exported with their status and
  restored as they were.
- Split lines whose category or person was later merged: exported under the current names.
- A backup exported on a different date: importing restores the original dates (upcoming items stay upcoming
  only if still in the future; otherwise they wait in "To confirm", as R4 does).
- Text that a spreadsheet could treat as a formula (a note starting with `=`, `+`, `-` or `@`) is written so
  the spreadsheet shows it as text and never runs it.
- Names containing commas, quotes or line breaks are kept intact in CSV.
- The user's allowance would be exceeded by the attachments in a backup: the import says so before it
  starts and offers to import without the files.
- The import is interrupted (connection lost, tab closed): nothing is half-imported; the user can try again.
- Change history (who changed what, when) is not part of the export and is not restored; the restored records
  start a fresh history ("imported from a backup").

## Requirements *(mandatory)*

### Functional Requirements

**Export**

- **FR-001**: Users MUST be able to export their own data from Settings › Your data in three formats:
  Backup (JSON), Excel workbook, CSV (zip). Only the user's own records are ever exported.
- **FR-002**: A backup MUST contain every live record of the user (accounts and groups, categories, tags,
  payees and people, transactions with split lines, interest rates, plan items and plan months, templates,
  attachment details, warranty fields, preferences), a format version, the app version and the export time;
  amounts as exact paise. Change history is not included (clarified 2026-11-14).
- **FR-003**: Excel and CSV exports MUST have one sheet / file per record type with readable column names, names
  instead of ids (category as its full path), dates as dates, amounts in rupees with two decimals (Excel in the
  user's number format; CSV with a dot and no grouping), and split lines as their own sheet linked by a
  transaction number.
- **FR-004**: Excel and CSV exports MUST offer a date range (This month, Last month, This financial year, Last
  financial year, a custom range, Everything; default Everything) applied to transactions, their split lines and
  attachments; lists are always complete. Backups are always everything.
- **FR-005**: Exports MUST be safe to open: text cells that a spreadsheet could read as a formula are written
  as text; CSV is UTF-8 and opens correctly in Excel.
- **FR-006**: Export file names MUST say what they are and the date (e.g. "Finance Tracker backup
  2026-11-14.json", "Finance Tracker transactions 2026-04-01 to 2026-11-14.xlsx").
- **FR-007**: The export MUST show progress and finish within the success criteria for the R4 performance size;
  it MUST not change any data.

**Attachments**

- **FR-008**: Users MUST be able to include attachment files in any export ("Include attachments", off by
  default); the download is then a zip with the data and an `attachments` folder; the size is shown first.
- **FR-009**: Without the files, the export MUST still list each attachment (transaction, name, type, size).

**Import (backup)**

- **FR-010**: Users MUST be able to import a backup only into empty data (as the demo load), or reset and
  import in one step after typing RESET; never merged into existing data.
- **FR-011**: Before importing, the app MUST check the whole file — it is a backup of this app, a supported
  format version, every record valid by the same rules as entering it by hand, every reference resolvable —
  and show its contents (counts by type, export date) for confirmation. Any problem refuses the whole import
  with a report of the first problems in words.
- **FR-012**: An import MUST be all or nothing: either every record is restored, or nothing is.
- **FR-013**: Restored data MUST be the importing user's own (new ids are fine; references kept); balances,
  person balances, report totals, plan statuses and template order MUST equal those at export time.
- **FR-014**: A backup that includes attachment files MUST restore them within the user's allowance; if they
  do not fit, the user is told before the import and may import without the files. Clarified 2026-11-14.
- **FR-015**: After an import, a report MUST say what was restored (counts by type, files restored or skipped).

**Privacy and history**

- **FR-018**: Users MUST be able to lock a backup with a password of their choice at export (optional, at
  least 8 characters, typed twice); a locked backup cannot be read without it, and importing it asks for it.
  The app MUST say plainly that a lost password cannot be recovered. A wrong password refuses the import
  without changing anything. Excel and CSV exports are not locked. Clarified 2026-11-14.

- **FR-016**: Exports and imports MUST be recorded in the change history (that it happened, the format, the
  counts) without any record contents; nothing about the data (names, amounts, notes) is written to logs.
- **FR-017**: Exports MUST be produced for the signed-in user only, on their own action; there is no shared
  or public export link.

### Key Entities

- **Backup**: a complete, versioned copy of one user's data (JSON), optionally zipped with attachment files.
- **Spreadsheet export**: Excel workbook or CSV zip — one table per record type, for reading, not for import.
- **Import report**: what a backup contains, what was restored, and any problems found.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Export → reset → import of the demo household gives back identical balances, person balances,
  report totals for every month, plan statuses and templates (checked automatically).
- **SC-002**: A backup of 20,000 transactions is exported in under 30 seconds and imported in under 2 minutes
  (every record passes the same checks as entering it; planning measured about 4 ms a record); the screen stays
  responsive with progress shown.
- **SC-003**: For any date range, the Excel / CSV transaction totals (income, spending) equal the Reports
  totals for the same range.
- **SC-004**: A damaged, foreign or rule-breaking file never changes any data (tested with a set of bad
  files) and the user sees what is wrong.
- **SC-005**: No export ever contains another user's data, and no log line contains exported contents
  (tested).
- **SC-006**: The export and import screens pass the accessibility checks used for other screens at desktop
  and phone widths.

## Assumptions

- Excel means a standard .xlsx workbook; CSV is a zip of UTF-8 files with a header row.
- Only the backup (JSON) can be imported; spreadsheets are for reading.
- Imports into existing data (merging) are out of scope; the user resets first, as for the demo load.
- Change history and sign-in activity are not exported (they describe the account, not the household's money).
- Exports are produced on the user's device or for that user's request only; nothing is stored on a server
  after the download.
- Synthetic data only in development and tests.

## Dependencies

- R2–R4 records, R5 reset and "only into empty data", R6 periods and report totals, R7 plan, R8 templates,
  R9 attachments and allowance.
