# Data Model: Data Export (R10)

## Vocabulary

| Name | Values |
|------|--------|
| `public.audit_action` (added) | `data_exported`, `data_imported`, `data_import_undone` |
| HTTP error codes (added) | `IMPORT_NOT_OPEN`, `IMPORT_REJECTED` (with the change result) |

## Import session — `private.imports` (server only)

| Field | Type | Rules |
|-------|------|-------|
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | The importing user; at most one open session per user |
| `device` | `text` | `web` / `android` |
| `state` | `text` | `open` → `finished` / `undone` |
| `counts` | `jsonb` | Created records by entity (for the report) |
| `started_at`, `ended_at` | `timestamptz` | |

No client access (private schema). Reset (R5) closes an open session.

## Backup file (core schema, version 1)

| Part | Content |
|------|---------|
| Envelope | `format: "finance-tracker-backup"`, `version: 1`, `exportedAt` (ISO), `appVersion` |
| `preferences` | number and date format, financial year start, timezone, accounts view, buffer, plan nudge, warranty reminder days (base currency is shown, and must match on import) |
| `records` | Per entity: the pull wire rows of live records, without `serverSeq`, `fieldVersions`, `userId` |
| Interest marks | Transactions keep `generated`, `interestMonth`, `userEdited`; `declinedInterest: [{ payeeId, month }]` |
| Locked | `locked: { kdf: "PBKDF2-SHA-256", iterations: 600000, salt, iv }`, `data` = base64 AES-GCM of the plain JSON |
| With files (zip) | `backup.json` (plain or locked), `attachments/<n>.<ext>` (locked: `.bin`), `<n>` mapped in the JSON |

## Spreadsheet tables (Excel sheets / CSV files)

| Table | Columns (in order) |
|-------|--------------------|
| Accounts | Name, Type, Group, Opening balance, Opening date, Credit limit, In net worth, Archived, Notes |
| People & payees | Name, Kind, Default category, Opening balance, Opening date, In net worth, Interest, Hidden, Notes |
| Categories | Path, Kind, Hidden |
| Tags | Name |
| Transactions | No., Date, Time, Type, Account, To account, Payee / person, What happened, Category, Tags, Amount, In / out, Status, Confirmed, Notes, Reference, Pays (plan item, month), Under warranty until, Warranty note, Attachments |
| Split lines | Transaction no., Category, Person, What happened, Amount, Tags, Notes |
| Interest rates | Person, From month, Rate % per month |
| Payment plan | Item, Pays (payee / card / person), Frequency, Every N months, Start month, End month, Amount varies, Terms (from month, amount, due day, account), Notes |
| Plan months | Item, Month, Amount, Skipped |
| Templates | Name, Type, Account, To account, Payee / person, Category, Amount, Pays, Hidden, Notes |
| Attachments | Transaction no., Date, Name, Type, Size, File (in the zip, when included) |

Amounts: rupees, two decimals; Excel numbers formatted per the user's number format; CSV plain `1234.50`.
"In / out" says the direction where the amount alone does not.
