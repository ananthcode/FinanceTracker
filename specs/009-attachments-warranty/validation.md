# Validation: Attachments & Warranty Flag (R9)

Run on 2026-11-14 against the local Supabase stack (Storage included), on branch
`009-attachments-warranty`. Environment: Windows 11, Chromium, `next dev`. All data is synthetic
(`@example.com` users, the generated demo household, generated PNG and PDF files). Steps are in
[quickstart.md](quickstart.md).

## Automated suites

| Suite | Command | Result |
|-------|---------|--------|
| Core unit (Vitest) | `pnpm test` | `@ft/core` 36 files, 354 passed. R9 adds `attachments` (8: picked types, sizes, resizing, names, allowance, sizes in words, wire shapes), `warranty` (8: reminders, chosen days, pairs, time left, order, field rules) and `demo-warranty` (3: two warranties, the receipt change, a well-formed PDF). |
| Web / DB / Mobile unit | `pnpm test` | `@ft/web` 23, `@ft/db` 5, `@ft/mobile` 47 passed |
| Database (pgTAP) | `pnpm db:test` | 39 files, 640 tests, PASS. R9: `att_rls` 14 (storage policies and records), `att_apply` 27, `att_data` 8; `data_reset` expects the attachment count. |
| Integration | `pnpm --filter @ft/web test:int` | 18 files, 88 passed. R9: `attachments` (6): upload link → upload → record → pull → open; a record without its file and a wrong type refused; privacy between users; clean-up after deletes; reset removes files and a demo load stores the receipt; reminder days. |
| End-to-end (Playwright) | `pnpm exec playwright test` (every module, R1–R9) | 130 tests: **121 passed, 6 skipped** (production-only performance checks), 3 failed in the full run (28.0 min) — then **all 3 passed on re-run** (see below) |
| Typecheck / Lint | `pnpm typecheck`, `pnpm lint` | PASS, no warnings |

**Failures in the full run, and what they were:**
- `a11y` "keyboard only: Tab reaches the navigation in order" expected Settings after Payment plan; the new
  **Warranties** link now sits between them. The test was updated to the new order (9 stops) and passes.
- `us4-admin` "revoke and resend invitations" and "disable signs the member out everywhere": the browser
  reported `net::ERR_NETWORK_IO_SUSPENDED` (the machine paused); both passed on re-run, with the rest of
  `us4-admin` (7/7, including erasure, which now removes the user's files first).

**Fixes found by the runs:**
- Pulled attachment sizes came back as JSON numbers; they now travel as decimal strings like money.
- The default preferences check (`/api/me`) now includes the two reminder days.

## Quickstart rows → evidence

| Row | Covered by | Result |
|-----|-----------|--------|
| S1-a | `r9-us1-attach`: a 3000 × 2000 PNG is stored as a 2000 × 1333 JPEG under 1 MB, named `.jpg`, listed as Photo; it opens through `/api/attachments/:id` | PASS |
| S1-b | `r9-us1-attach`: a PDF attached, then deleted after confirming; gone from the list and from storage | PASS |
| S1-c | `r9-us1-attach`: a .docx and an 11 MB PDF are refused with what is allowed | PASS |
| S1-d | `r9-us1-attach`: deleting the transaction says "Its 2 attachments are deleted too."; storage is empty afterwards | PASS |
| US1 6 | `r9-us1-attach`: a PDF picked while adding is attached on Save; the row shows "1 attachment" | PASS |
| FR-003 / SC-002 | `att_rls` (pgTAP), `attachments` integration (open, list, signed link, download, upload link and remove across users all refused), `r9-us1-attach` (401 without a session) | PASS |
| FR-007 | `att_apply` and integration: a record without its stored file, or with another size or type, is refused | PASS |
| S2-a | `r9-us2-warranty`: Warranties lists the demo's two soonest first with time left and receipt; a purchase marked until 20 days ahead leads the list and gets a reminder; Got it hides a reminder, after reload too | PASS |
| S2-b | `r9-us2-warranty`: the second reminder follows the first (off when the first is 15); 30/15 hides the 50-day reminder, 90/off shows it again | PASS |
| S2-c | `r9-us2-warranty`: the Under warranty filter shows exactly those 3; turning one off removes it from Warranties | PASS |
| S3-a | `r9-us3-storage`: "Attachments: 0 files, 0 bytes of 200 MB", then 1 file after the demo load | PASS |
| S3-b / SC-004 | `r9-us3-storage` and integration: a reset removes every file of the user; reset-and-load keeps only the new receipt; erasure removes the folder (`us4-admin` erase) | PASS |
| Allowance (US3 2, FR-005) | `att_apply` (`QUOTA_EXCEEDED` past 200 MB), the storage insert policy (`att_rls`), the upload-link route's message. Not driven end to end (it needs 200 MB of files). | PASS (DB) |
| 10 per transaction (US1 5) | `att_apply` (`LIMIT_REACHED`), the upload-link route and the disabled picker. Not driven end to end. | PASS (DB) |
| FR-013 | `us7-hide-balances`: Warranties masked; names and time left stay | PASS |
| SC-006 | `a11y` "R9 …": Warranties, Dashboard reminders, a transaction with attachments and warranty, the filtered list and Settings at 1280 and 390 px; Got it and the delete dialog by keyboard | PASS |
| SC-005 (open within 2 s) | Opening is one redirect to a signed link; files open at once locally. Not measured on the hosted project. | Not measured |

## Not covered here

- Android (US4) — the Android phase.
- HEIC decoding depends on the browser; Chrome on Windows cannot, and the user is told to use JPEG or PNG.
