# Review notes: Attachments & Warranty Flag (R9)

Code the constitution requires the owner to review explicitly before merge (Development Workflow
& Quality Gates: authorization/RLS, storage, sync, money, erasure). Links are relative to the repository
root.

## 1. Storage: the bucket and its policies

[20261115000002_att_storage.sql](../../supabase/migrations/20261115000002_att_storage.sql)

- Bucket `attachments`: private, 10 MB per object, only `image/jpeg`, `image/png`, `image/webp`,
  `application/pdf`. Created by the migration, so the hosted project gets it on deploy (no new service).
- Policies on `storage.objects` (all `to authenticated`, active users only):
  - **select** and **delete**: the object name starts with the caller's own id (`<uid>/…`);
  - **insert**: the name is exactly `<uid>/<uuid>` (no subfolders), and the caller's folder holds
    less than 200 MB (`app.my_attachment_bytes()`, SECURITY DEFINER, reading only the caller's folder);
  - **no update** policy: a file is never replaced.
- Storage refuses direct SQL deletes (`protect_objects_delete`), so files are only removed through the
  Storage API (section 4).
- Tests: [att_rls.test.sql](../../supabase/tests/att_rls.test.sql) (14): own folder only for read, add and
  remove; another user's folder refused; no subfolders; no replace; the owner-admin and a disabled user
  see nothing. Integration: [attachments.int.test.ts](../../apps/web/lib/attachments.int.test.ts)
  "keeps each user's files private" (open, list, signed link, download, upload link and remove into
  another user's folder all refused).

## 2. Attachment records: a new synced table and its applier

[20261115000003_att_tables.sql](../../supabase/migrations/20261115000003_att_tables.sql),
[20261115000004_att_apply.sql](../../supabase/migrations/20261115000004_att_apply.sql)

- `public.attachments`: RLS select-own for active users, SELECT-only grants; composite FK
  `(transaction_id, user_id)`; checks on name (1–120 trimmed), type and size (≤ 10 MB).
- `app._apply_attachment` (SECURITY DEFINER, inside `apply_changes`): a **create is accepted only when the
  file is already stored** at `<caller>/<id>` with the same size and type (read from `storage.objects`
  metadata) — no record without its file (FR-007); the transaction must be the caller's and live; at most
  10 live per transaction (`LIMIT_REACHED`); the caller's stored bytes, this file included, within 200 MB
  (`QUOTA_EXCEEDED`). Afterwards only the name can change; delete is soft.
- `app._apply_one` is R8's with the `attachment` dispatch and the codes `INVALID_ATTACHMENT`,
  `QUOTA_EXCEEDED`, `INVALID_WARRANTY`.
- Tests: [att_apply.test.sql](../../supabase/tests/att_apply.test.sql) (27).

## 3. Transactions: warranty fields, and attachments going with a delete

Same migration (`_apply_transaction` replaced again, as R7's
[20261113000005_plan_links.sql](../../supabase/migrations/20261113000005_plan_links.sql); the generator
script changed only the listed lines).

- New fields `warranty_until` (≥ the purchase date, ≤ 30 years after), `warranty_note` (≤ 200, only with
  a date) — one field version `warranty` — and `warranty_dismissed` (0–2, its own version). A new expiry
  resets `warranty_dismissed` to 0 and bumps its version. Bad values → `INVALID_WARRANTY`; a table check
  backs it.
- **Deleting a transaction soft-deletes its live attachment records in the same change** (clarify Q2),
  bumping their `state` version so devices pull it. The files are removed by the deleting client's
  clean-up call (section 4).
- Preferences `warranty_first_days` (15/30/60/90, default 60) and `warranty_second_days` (15/30/60 or
  null, default 30, below the first): column checks plus a pair check; client-updatable on the user's own
  row only (column grant, existing update policy).

## 4. Removing files; reset, erasure and the demo receipt

- [app/api/attachments/cleanup](../../apps/web/app/api/attachments/cleanup/route.ts) → 
  [`removeMyOrphanFiles`](../../apps/web/lib/attachments-server.ts): lists
  `app.my_orphan_attachment_files()` (INVOKER: the caller's own objects with no live record — deleted
  ones, or uploads older than an hour whose record never came) and removes them **with the caller's own
  client**, so the delete policy applies. Called after deleting an attachment or a transaction with
  attachments, and when a record is refused after an upload.
- Reset ([`/api/me/data`](../../apps/web/app/api/me/data/route.ts)): after the database reset, the
  **service role** removes every file in the user's folder (reset-and-load keeps only the new demo
  receipt). A failed removal leaves orphans, which the next clean-up removes.
- Erasure ([`eraseUser`](../../apps/web/lib/admin.ts)): the user's folder is removed with the service
  role **before** the audit scrub and the auth user's deletion; a failure stops the erasure (it can be
  run again).
- Demo load: the route stores the synthetic receipt (written by core, marked "DEMO DATA, NOT A REAL
  PURCHASE") with the service role into the user's own folder, then loads; a failed load removes it.
- `pull_changes`, `_reset_user_data`, `_load_demo`, `scrub_user_from_audit` and `search_transactions`
  learn attachments ([20261115000005_att_pull_reset.sql](../../supabase/migrations/20261115000005_att_pull_reset.sql),
  generated). The search stays INVOKER and gains `warranty` and an attachment count.
- Tests: [att_data.test.sql](../../supabase/tests/att_data.test.sql) (8); integration "removes the files of
  deleted attachments and of a deleted transaction" and "a reset removes every file; a demo load stores
  the demo receipt"; e2e `r9-us1-attach`, `r9-us3-storage` check the bucket itself.

## 5. Uploading and opening (web)

- [`POST /api/attachments`](../../apps/web/app/api/attachments/route.ts) returns a **one-time upload link**
  for a fresh id in the caller's folder, created with the caller's own client (so the insert policy is
  checked when the link is made). It checks first, for a clear message: the transaction is the caller's
  and live, it has room, the allowance has room; rate-limited (60 a minute). No file passes through the
  web server (Vercel's request size limit does not apply).
- The browser uploads straight to storage with that link, then pushes the record; the applier checks the
  stored object (section 2).
- [`GET /api/attachments/:id`](../../apps/web/app/api/attachments/[id]/route.ts): looks the record up with
  the caller's client (RLS) and redirects to a signed link valid for **120 seconds**; another user's id is
  a 404, no session is a 401.
- Photos are drawn on a canvas in the browser ([compress.ts](../../apps/web/lib/compress.ts)): long side
  ≤ 2,000 px, JPEG 0.8. Only pixels are kept, so location and camera details are dropped (FR-002).

## 6. Money

No new money arithmetic. Warranty rows show amounts through `<Money>` (hide-balances checked). Sizes are
bytes (decimal strings on the wire, like money).

## Decisions taken without asking (inside the agreed scope)

- **Upload through one-time links** rather than a browser Supabase session (the web keeps its session in
  http-only cookies) or through the web server (Vercel's 4.5 MB request limit is below the 10 MB PDF
  limit).
- **Clean-up by the user's own clients** instead of a scheduled server job (no paid cron or external
  scheduler); files waiting for clean-up still count against the allowance.
- **Warranty on any transaction kind** (the spec says "a transaction"); the Warranties list names the item
  by payee, else notes, else category.
- **Voided transactions keep their warranty and stay listed** (spec edge case: the user decides).
- **"Got it" is stored on the transaction** (`warranty_dismissed`), so it syncs (clarify Q3).
- **Usage is shown in Settings › Your data** from `app.my_attachment_usage()` rendered on the server
  (no separate usage endpoint; contract updated).
- **Demo**: the refrigerator's warranty ends 50 days after "today" (inside its first reminder), a phone
  has about eight months left; one synthetic receipt PDF.

## Not done here

- Android (US4): the camera, the offline upload queue and the screens — Android phase (the row mappers
  for attachments and warranty fields are in).
- An abandoned upload on a device that never opens the web app again stays until that user's next web
  clean-up (it still counts against their allowance).
- HEIC: browsers that cannot decode HEIC are told to use JPEG or PNG (spec assumption); Chrome on Windows
  cannot.
