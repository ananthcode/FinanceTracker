# Research: Attachments & Warranty Flag (R9)

Decisions for [plan.md](plan.md). Spec: [spec.md](spec.md) (clarified 2026-11-14, Q1–Q3).

## R9-01 Where files live: one private Supabase Storage bucket

**Decision**: bucket `attachments` on the existing project (no new provider or cost), `public = false`,
file size limit 10 MB, allowed types `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Object
path `<user_id>/<attachment_id>`. Storage RLS policies on `storage.objects` allow `select`, `insert` and
`delete` only when `bucket_id = 'attachments'`, the first folder is `auth.uid()` and the user is active.
There is no update (a file is never replaced; a new attachment is a new object). Opening a file uses a
signed URL valid for 120 seconds (FR-003).

**Alternatives**: a public bucket with unguessable names (anyone with the link can open it, forever); another
provider such as Cloudflare R2 or Google Drive (a new external service and account, an escalation item).

## R9-02 The attachment record: synced details, created after the upload

**Decision**: synced table `public.attachments` (R2 conventions): `transaction_id`, `name`, `content_type`,
`size_bytes`, `state`. The client uploads the file first, then pushes a `create` for the record with the same
id. The applier checks that the object `<user>/<id>` exists in the bucket with that size and type
(`storage.objects` metadata), that the transaction is the caller's and live, at most 10 live attachments on
it (`LIMIT_REACHED`), and that the user's stored total stays within 200 MB (`QUOTA_EXCEEDED`). So no record
ever exists without its file (FR-007). Records are created and deleted, never edited (`update` only renames).

**Rationale**: the record syncs like any other (Android gets the list); the file is fetched only when opened.

## R9-03 Removing files: the Storage API, from the user's own clients and the server

Storage refuses direct SQL deletes (`protect_objects_delete`), so files are removed through the Storage API:
- **Delete one attachment**: the client removes the object (its own folder; RLS) and pushes the record's
  `delete`. If the object removal fails, the record delete still goes, and the clean-up below removes the file.
- **Delete a transaction** (clarify Q2): `_apply_transaction` soft-deletes its attachment records in the same
  change; the deleting client then removes their files.
- **Clean-up** (`app.my_orphan_attachment_files()`, INVOKER over the user's own rows): objects in the user's
  folder with no live record — deleted records, or uploads whose record never arrived (older than one hour) —
  are listed and removed by the user's next web client after a sync. Abandoned uploads therefore do not
  stay, and space is freed.
- **Data reset and erasure** run on the server: after the database reset, the route lists and removes the
  user's folder with the service role; erasure does the same before the auth user is deleted.

The allowance counts what is actually stored (the sum of object sizes in the user's folder), so files waiting
for clean-up still count until removed.

## R9-04 Compression on the device

**Decision**: the browser decodes the photo (`createImageBitmap` with EXIF orientation), draws it on a canvas
with the long side at most 2,000 px, and encodes JPEG at quality 0.8 — this also drops location and camera
details (FR-002). PDFs are uploaded as they are (≤ 10 MB). HEIC: browsers that cannot decode it are told to
use JPEG or PNG (spec assumption). Core holds the pure parts: `fitWithin`, `attachmentProblem` (type and size
rules) and the allowance arithmetic.

## R9-05 Warranty: three transaction fields

**Decision**: `transactions.warranty_until` (date, ≥ the transaction date), `warranty_note` (≤ 200 chars) and
`warranty_dismissed` (0 none, 1 first reminder dismissed, 2 second dismissed). `warrantyUntil` and
`warrantyNote` share one field version `warranty`; changing the expiry resets `warrantyDismissed` to 0.
`_apply_transaction` is replaced again (R7's version plus these fields) — `INVALID_WARRANTY` for a bad date.

## R9-06 Reminders (clarify Q3)

**Decision**: two preferences, `warranty_first_days` (15/30/60/90, default 60) and `warranty_second_days`
(15/30/60 or null = off, default 30, below the first), through the R1 preferences endpoint. Core
`warrantyReminder(today, until, dismissed, prefs)` returns the reminder due (1 or 2) or none: reminder 2 when
days left ≤ second and dismissed < 2; else reminder 1 when days left ≤ first and dismissed < 1; nothing after
expiry (expired warranties are listed under Warranties › Expired). "Got it" pushes `warrantyDismissed` = the
reminder's number.

## R9-07 Lists and filter

**Decision**: `/warranties` reads transactions with `warranty_until` set (live, not void) through the user's
client; core sorts and words them. `app.search_transactions` gains a `warranty: true` filter (still INVOKER).
The Dashboard shows due reminders. Demo: two purchases with warranties (one inside its first reminder) and a
synthetic receipt PDF made by core's existing PDF writer (R6), uploaded by the demo-load route.
