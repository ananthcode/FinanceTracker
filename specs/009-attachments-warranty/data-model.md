# Data Model: Attachments & Warranty Flag (R9)

## Vocabulary

| Name | Values |
|------|--------|
| `public.audit_action` (added) | `attachment_created`, `attachment_edited`, `attachment_deleted` |
| `audit_events.target_type` (added) | `attachment` |
| Rejection codes (added) | `INVALID_ATTACHMENT`, `QUOTA_EXCEEDED`, `INVALID_WARRANTY`; `LIMIT_REACHED` reused |

## Storage: bucket `attachments`

Private; 10 MB per object; `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Object name
`<user_id>/<attachment_id>`. RLS on `storage.objects`: select, insert, delete for the owner's folder only
(active users); no update.

## Entity: Attachment — `public.attachments` (synced)

| Field | Type | Rules |
|-------|------|-------|
| `id` | `uuid` | Client-generated; also the object's name in the user's folder |
| `user_id` | `uuid` | Owner |
| `transaction_id` | `uuid` not null | The caller's live transaction; composite FK; create-only |
| `name` | `text` not null | 1–120 chars (the original file name, trimmed) |
| `content_type` | `text` not null | One of the four allowed types; create-only |
| `size_bytes` | `bigint` not null | 1 … 10,485,760; must equal the stored object's size; create-only |
| `state` | `record_state` | `active` / `deleted` |
| `deleted_at`, `field_versions`, `server_seq`, `created_at`, `updated_at` | | R2 conventions |

Index `(user_id, server_seq)`, `(transaction_id) where state = 'active'`. At most 10 live per transaction.
Allowance: the user's stored bytes (sum of object sizes in their folder) + the new one ≤ 209,715,200.

## Transaction (R4, extended)

| Field | Type | Rules |
|-------|------|-------|
| `warranty_until` | `date` null | ≥ `date`; null = no warranty |
| `warranty_note` | `text` null | ≤ 200 chars; only with `warranty_until` |
| `warranty_dismissed` | `smallint` not null default 0 | 0, 1 or 2; reset to 0 when `warranty_until` changes |

Field versions: `warranty` (until + note), `warrantyDismissed`. Deleting a transaction soft-deletes its live
attachments in the same change (clarify Q2).

## User preferences (R1, extended)

| Field | Type | Rules |
|-------|------|-------|
| `warranty_first_days` | `smallint` not null default 60 | 15, 30, 60 or 90 |
| `warranty_second_days` | `smallint` null default 30 | 15, 30 or 60, less than the first; null = off |

## Derived (core)

| Value | Definition |
|-------|-----------|
| Reminder due | `warrantyReminder` (research R9-06) |
| Time left | days from today to `warranty_until`, in words |
| Allowance left | 200 MB − stored bytes |
