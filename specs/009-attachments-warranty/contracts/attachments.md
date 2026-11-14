# Contract: Storage, sync and screens for attachments and warranties (R9)

## Storage (Supabase Storage, bucket `attachments`)

| Action | Who | How |
|--------|-----|-----|
| Upload | the owner | `storage.from('attachments').upload('<user>/<id>', blob, { contentType, upsert: false })` |
| Open | the owner | `createSignedUrl('<user>/<id>', 120)` |
| Remove | the owner (own folder) | `remove(['<user>/<id>'])` |
| Remove all (reset, erasure) | the server (service role) | list the folder, remove in batches |

## Sync

| Entity | Kinds | Fields |
|--------|-------|--------|
| `attachment` | `create`, `update` (name only), `delete` | `transactionId`, `name`, `contentType`, `sizeBytes` (decimal string) |
| `transaction` (R4, extended) | as R4 | + `warrantyUntil` (`yyyy-MM-dd` or null) and `warrantyNote` (together, version `warranty`), `warrantyDismissed` (0–2) |

| Code | When |
|------|------|
| `INVALID_ATTACHMENT` | No stored object `<user>/<id>` with that size and type; the transaction is not the caller's or is deleted; a bad type, size or name |
| `QUOTA_EXCEEDED` | The user's stored bytes would pass 200 MB |
| `LIMIT_REACHED` | The transaction already has 10 live attachments |
| `INVALID_WARRANTY` | `warrantyUntil` before the transaction date; a note without a date; `warrantyDismissed` out of range |

Pull: `rows` gains `attachment`; transaction rows carry the warranty fields.

## HTTP

- `PATCH /api/me/preferences` gains `warrantyFirstDays` (15/30/60/90) and `warrantySecondDays` (15/30/60/null),
  checked together (the second below the first).
- `GET /api/me/attachments/usage` → `{ files, bytes, allowance }` for Settings.
- Server action `cleanupAttachmentFiles()` removes the caller's orphan objects (research R9-03).
- `POST /api/me/data` (R5) reset and reset-and-load also remove the user's files; demo load uploads the
  synthetic receipt before applying the changes.

## Screens

| Place | Shows |
|-------|-------|
| `/transactions/[id]` (R4, extended) | "Attachments" `#attachments`: each `[data-attachment]` with name, type, size, date added, preview for photos, Open, Delete; "Attach a receipt" (file input: photos and PDFs). "Warranty" `#warranty`: "Under warranty" switch, "Until" date, note. Delete warns how many attachments go with it |
| `/transactions/new` (R4, extended) | "Attach a receipt" before saving: files are uploaded after the transaction is saved; cancelling uploads nothing |
| `/transactions` (R4) | Filter "Under warranty" (`?warranty=1`); a paper-clip mark on rows with attachments |
| `/warranties` | `#warranties-active` (soonest first) and `#warranties-expired`; each `[data-warranty]` with item, purchase date, expiry, time left in words, receipt attached or not |
| `/` Dashboard (R6, extended) | `#warranty-reminders`: due reminders with item, days left, "Got it" |
| `/settings` (extended) | Reminder days (first, second); "Attachments: N files, X MB of 200 MB" |

## Core (`packages/core/src/attachments/`, `packages/core/src/warranty/`)

```ts
ATTACHMENT_TYPES, ATTACHMENT_MAX_BYTES (10 MB), ATTACHMENT_ALLOWANCE (200 MB), ATTACHMENTS_PER_TRANSACTION (10)
attachmentProblem(type, size): "type" | "size" | null
fitWithin(width, height, max = 2000): { width; height }
allowanceLeft(storedBytes): bigint
warrantyReminder(today, until, dismissed, prefs): 1 | 2 | null
warrantyTimeLeft(today, until): string              // "3 months left", "expires in 12 days", "expired 4 days ago"
```
