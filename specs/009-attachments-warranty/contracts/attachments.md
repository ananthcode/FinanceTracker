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

As built (2026-11-14):

- `POST /api/attachments` `{ transactionId, contentType, sizeBytes }` → `{ id, uploadUrl }`: a one-time upload
  link for `<caller>/<id>` (the browser PUTs the file to it, then pushes the record). 404 when the transaction
  is not the caller's live one; 409 `LIMIT_REACHED` (10 on it) or `QUOTA_EXCEEDED` (with the free space);
  400 for other types or sizes over 10 MB; rate-limited.
- `GET /api/attachments/:id[?download=1]` → 302 to a signed link valid for 120 s; 404 for another user's or a
  deleted attachment; 401 without a session.
- `POST /api/attachments/cleanup` → `{ removed }`: removes the caller's orphan files (research R9-03).
- `PATCH /api/me/preferences` gains `warrantyFirstDays` (15/30/60/90) and `warrantySecondDays` (15/30/60/null),
  sent together (the second below the first), else 400.
- `POST /api/me/data` (R5): reset and reset-and-load also remove the user's files (`removed.attachments`
  counts the records); a load stores the synthetic receipt first (`loaded.attachment`).
- Usage for Settings is read on the server with `app.my_attachment_usage()` (no separate endpoint).

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
