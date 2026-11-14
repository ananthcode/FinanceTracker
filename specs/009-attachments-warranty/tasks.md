---
description: "Task list for R9 — Attachments & warranty flag"
---

# Tasks: Attachments & Warranty Flag

**Input**: Design documents from `/specs/009-attachments-warranty/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/attachments.md, quickstart.md

**Tests**: Included (constitution IX; SC-002, SC-003, SC-004, SC-006). Tests come first.

**Organization**: by user story. Stories 1–3 are on the web now; Story 4 (Android) is deferred, except that
the mobile row mappers learn the new entity and fields (T006).

Migration names are `20261115000NNN_*` (`<ts>`), in the listed order.

---

## Phase 1: Setup (schema and shapes)

- [ ] T001 Migration `<ts>_att_enums.sql`: audit actions `attachment_created`, `attachment_edited`, `attachment_deleted`; target type `attachment`
- [ ] T002 Migration `<ts>_att_storage.sql`: bucket `attachments` (private; `file_size_limit` 10485760; types `image/jpeg`, `image/png`, `image/webp`, `application/pdf`); policies on `storage.objects` for `select`, `insert`, `delete` "bucket = attachments and first folder = auth.uid() and app.is_active_user()"; no update policy
- [ ] T003 Migration `<ts>_att_tables.sql`: `public.attachments` per data-model.md (`name` "1–120 chars" trimmed; `content_type` one of four; `size_bytes` "1 … 10,485,760"; composite FK `(transaction_id, user_id)`); sync and live-per-transaction indexes; RLS select-own, SELECT-only; stamp and audit triggers. Transactions gain `warranty_until date` (≥ `date`), `warranty_note` (≤ 200, only with a date), `warranty_dismissed smallint not null default 0` (0–2). Preferences gain `warranty_first_days smallint not null default 60` (15/30/60/90) and `warranty_second_days smallint default 30` (15/30/60 or null, below the first), client-updatable
- [ ] T004 [P] Core `packages/core/src/attachments/index.ts` (constants, `attachmentProblem`, `fitWithin`, `allowanceLeft`, `formatBytes`) and `packages/core/src/warranty/index.ts` (`warrantyReminder`, `warrantyDaysLeft`, `warrantyTimeLeft`, `sortWarranties`, `WARRANTY_FIRST_CHOICES`, `WARRANTY_SECOND_CHOICES`); sync entity `attachment` and codes `INVALID_ATTACHMENT`, `QUOTA_EXCEEDED`, `INVALID_WARRANTY` in `packages/core/src/sync/schemas.ts`; transaction schemas learn `warrantyUntil`, `warrantyNote`, `warrantyDismissed`; preferences learn `warrantyFirstDays`, `warrantySecondDays`; exports
- [ ] T005 [P] `packages/db`: `repositories/attachments.ts` (`listAttachments`, `attachmentFromRow`, `attachmentUsage`), transaction row mapping for warranty fields, preferences columns; `pnpm db:types`
- [ ] T006 [P] Mobile `apps/mobile/src/lib/sync/attachments.ts` row mapper and the transaction mapper's warranty fields (no screens)

## Phase 2: Foundational (rules, appliers, sync)

- [ ] T007 [P] Core vectors `packages/core/test/attachments.test.ts` and `warranty.test.ts`: types and sizes, `fitWithin` (landscape, portrait, small stays), allowance; reminders (first, second, off, dismissed 1 and 2, expired, before first), days left in words, sort
- [ ] T008 Core implementation — passes T007
- [ ] T009 [P] pgTAP `supabase/tests/att_rls.test.sql`: storage policies (own folder only for select/insert/delete; another user's folder refused; no update; inactive user refused); `attachments` select-own
- [ ] T010 [P] pgTAP `supabase/tests/att_apply.test.sql`: create needs the stored object (size and type match) → else `INVALID_ATTACHMENT`; another user's or deleted transaction refused; `LIMIT_REACHED` at 10; `QUOTA_EXCEEDED` past 200 MB; rename; delete; create replay merges; transaction delete soft-deletes its attachments; warranty fields: rules, `INVALID_WARRANTY`, `warrantyDismissed` reset on expiry change, audit
- [ ] T011 Migration `<ts>_att_apply.sql`: `app._apply_attachment`, `_apply_transaction` (R7 version + warranty fields + attachment soft-delete on delete), `_apply_one` (dispatch and codes), `app.my_attachment_usage()`, `app.my_orphan_attachment_files()` — passes T009–T010
- [ ] T012 [P] pgTAP `supabase/tests/att_data.test.sql`: pull returns attachments and warranty fields; reset removes attachment rows (count `attachments`) and their history; demo-load emptiness counts them; erasure scrubs `attachment` history; `search_transactions` warranty filter
- [ ] T013 Migration `<ts>_att_pull_reset.sql`: `pull_changes`, `_reset_user_data`, `_load_demo`, `scrub_user_from_audit`, `search_transactions` — passes T012
- [ ] T014 [P] Integration `apps/web/lib/attachments.int.test.ts`: upload + record round trip; another user cannot open, list, upload into or remove a file; orphan clean-up; reset and erasure remove files; usage
- [ ] T015 `apps/web/lib/sync-client.ts` builders (`createAttachment`, `renameAttachment`, `deleteAttachment`, warranty fields on transaction updates); `apps/web/lib/attachments.ts` (client upload/open/remove, clean-up) and `apps/web/lib/attachments-server.ts` (remove a user's folder with the service role) — passes T014

## Phase 3: User Story 1 — Attach a receipt (P1) 🎯 MVP

**Independent test**: attach a photo and a PDF to a transaction, open both, delete one; delete the transaction and see the files go.

- [ ] T016 [P] [US1] E2E `apps/web/e2e/r9-us1-attach.spec.ts` (attach photo, compressed size, PDF, open, delete, wrong type, too big, delete transaction with its attachments, another user's link refused)
- [ ] T017 [US1] `apps/web/lib/compress.ts` (canvas: long side ≤ 2000, JPEG 0.8, orientation applied)
- [ ] T018 [US1] `apps/web/components/attachments/Attachments.tsx` (list, preview, Open, Delete, Attach) on `/transactions/[id]`; the delete warning counts attachments
- [ ] T019 [US1] Paper-clip mark on transaction rows with attachments (`TransactionRow`, list loader)

## Phase 4: User Story 2 — Warranties (P1)

**Independent test**: mark a purchase under warranty, see it on Warranties and as a Dashboard reminder; Got it hides it until the next.

- [ ] T020 [P] [US2] E2E `apps/web/e2e/r9-us2-warranty.spec.ts` (mark, list, filter, reminders, Got it, settings change)
- [ ] T021 [US2] Warranty fields on the transaction form (`#warranty`: switch, Until, note) for expense / person-out purchases
- [ ] T022 [US2] `/warranties` page (`#warranties-active`, `#warranties-expired`, `[data-warranty]`), nav link
- [ ] T023 [US2] Dashboard `#warranty-reminders` (`WarrantyReminders` client component; Got it pushes `warrantyDismissed`)
- [ ] T024 [US2] Transactions filter "Under warranty" (`?warranty=1`) in `lib/transactions.ts` and `FilterPanel`
- [ ] T025 [US2] Settings reminder choices in `PreferencesForm`; `PATCH /api/me/preferences` checks the pair

## Phase 5: User Story 3 — Storage within the free plan (P2)

**Independent test**: Settings shows files and MB of 200 MB; reset leaves no files.

- [ ] T026 [P] [US3] E2E `apps/web/e2e/r9-us3-storage.spec.ts` (usage, quota message, reset removes files)
- [ ] T027 [US3] Settings › Your data usage line; quota refusal message on attach
- [ ] T028 [US3] `/api/me/data` reset and reset-and-load remove the user's files; erasure removes them before the auth user; demo receipt PDF uploaded and recorded by the demo load (core `demo` warranties + receipt bytes)

## Phase 6: Polish & cross-cutting

- [ ] T029 [P] a11y (`/warranties`, transaction with attachments) and hide-balances additions
- [ ] T030 [P] Demo: two warranties (one inside its first reminder) in `packages/core/src/demo`; tests updated
- [ ] T031 `specs/009-attachments-warranty/review-notes.md` and `validation.md`; ROADMAP R9 (and R8 merged)

## Phase 7: User Story 4 — Android (P3, deferred)

- [ ] T032 [US4] Android screens for attachments and warranties — deferred to the Android phase

## Dependencies

Phase 1 → Phase 2 → US1, US2, US3 (independent of each other; US3's reset needs T015) → Polish. US4 deferred.

## Parallel examples

- T004, T005, T006 together after T001–T003.
- T009, T010, T012 together; T016, T020, T026 together.

## Implementation strategy

MVP is US1 (receipts kept with transactions). US2 adds warranties; US3 makes storage safe on the free plan.
