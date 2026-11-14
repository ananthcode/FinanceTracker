# Implementation Plan: Attachments & Warranty Flag

**Branch**: `009-attachments-warranty` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-attachments-warranty/spec.md`

## Summary

Receipts (photos and PDFs) kept with transactions, and warranties with two in-app reminders:
- **Attachments**: compressed on the device, uploaded to a private bucket in the existing Supabase project,
  listed with the transaction, opened through short-lived links, deleted with their transaction; 200 MB and
  10 per transaction.
- **Warranty**: "under warranty until" with a note on a transaction; a Warranties screen; reminders on the
  Dashboard at 60 and 30 days by default, set in Settings; an "Under warranty" filter.
- **Elsewhere**: usage in Settings; demo warranties and a synthetic receipt; reset and erasure remove files.

**How it is built**: Supabase Storage bucket `attachments` with RLS on the owner's folder (R9-01); a synced
`attachments` table whose `create` is accepted only once the file is stored (R9-02); file removal through the
Storage API by the user's clients and the server, with an orphan clean-up (R9-03); compression in the browser
(R9-04); three warranty fields on transactions and two preferences (R9-05, R9-06). Decisions are in
[research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x strict on Node.js 24 LTS; SQL (PostgreSQL 15+, Supabase)

**Primary Dependencies**: As R8, plus Supabase Storage (already part of the project and its client library).
**No new packages.**

**Storage**: bucket `attachments`; table `attachments`; `transactions.warranty_until`, `warranty_note`,
`warranty_dismissed`; `user_preferences.warranty_first_days`, `warranty_second_days`.

**Testing**: Vitest, pgTAP (incl. storage RLS), integration (real uploads to local storage), Playwright (+ axe).

**Target Platform**: Web on Vercel Hobby; Android in the Android phase (row mappers learn the entity and
fields now); Supabase Free (1 GB storage).

**Constraints**: free tiers (200 MB per user); `bigint` paise and byte counts as decimal strings; the single R2
write path for records; files only through the Storage API; no file contents or names in logs.

**Scale/Scope**: routes 1 new (`/warranties`), 5 extended (transaction new and detail, list, Dashboard,
Settings); 1 bucket, 1 synced table, 3 transaction fields, 2 preferences.

## Constitution Check

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Isolation | PASS | Storage RLS on the owner's folder; table RLS select-own; the applier checks the object, the transaction and the owner; signed links last 120 s |
| II | Money | PASS | Warranty amounts shown through `<Money>`; no new money arithmetic |
| III | Audit | PASS | Attachment and warranty changes audited; reset and erasure remove files and their history |
| IV | Offline-first | PASS (phased) | Records sync; the phone's offline upload queue is in the Android phase |
| V | No real data | PASS | Demo receipt is a generated PDF; no real receipts |
| VI | Secrets | PASS | Service role used only server-side for reset, erasure and the demo receipt |
| VII | Shared core | PASS | Type and size rules, resizing maths, allowance, reminders and time left in core |
| VIII | Validation | PASS | Zod for records and preferences; the applier re-validates against the stored object; bucket limits |
| IX | Testing | PASS | Storage RLS and cross-user tests; orphan clean-up; reminder vectors |
| X | Demo-first | PASS | Demo warranties and a receipt |
| XI | Simplicity | PASS | One bucket, one table; files never edited |
| XII | India-first | PASS | Dates dd-MMM-yyyy; "today" in the user's timezone |
| XIII | Accessible UX | PASS | Words for warranty status; file input with a label; keyboard Open/Delete |
| Flow | Gates | PASS | Clarify answered 2026-11-14 (Q1–Q3); storage RLS, sync, erasure listed for review |

**Post-design re-check**: PASS. Explicit review at the PR: the storage policies; the attachment applier's
object check and quota; deleting a transaction deleting attachments; the clean-up and the server-side
removal on reset and erasure; `_apply_transaction` warranty fields; `search_transactions` filter.

## Project Structure

```text
packages/core/src/attachments/   index.ts (types, sizes, fitWithin, allowance)
packages/core/src/warranty/      index.ts (reminders, time left)
packages/db/src/repositories/attachments.ts, warranties
supabase/migrations/20261115000001_att_*.sql … bucket + policies, table, apply, transaction fields, pull/reset
supabase/tests/att_*.test.sql
apps/web/
├── components/attachments/      AttachmentList, AttachButton (compression), lib/compress.ts
├── components/warranty/         WarrantyFields, WarrantyReminders
├── app/(app)/warranties/page.tsx
├── app/api/me/attachments/usage/route.ts; lib/attachments-cleanup.ts
└── e2e/r9-*.spec.ts
apps/mobile/src/lib/sync/attachments.ts
```

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| Orphan clean-up by the user's clients | Storage forbids SQL deletes; uploads can be abandoned | A scheduled server job needs a paid cron or an external scheduler |
| Record created after upload, checked against `storage.objects` | No record without its file (FR-007) | Creating the record first leaves records pointing at missing files offline |
