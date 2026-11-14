# Feature Specification: Attachments & Warranty Flag

**Feature Branch**: `009-attachments-warranty`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "R9 Attachments & warranty flag (roadmap row R9, depends on R4; P1): attach receipt
photos / PDFs to a transaction (compressed, offline-capable upload queue); warranty flag with expiry date on
a transaction. Files are kept in the existing Supabase project's storage (free tier), private to each
user. Web first; Android (camera capture and the offline upload queue) in the Android phase."

## Clarifications

### Session 2026-11-14

- Q: How much attachment space does each user get? → A: 200 MB per user (about 600 compressed photos or 100 large PDFs); an attachment that would go over it is refused with how much is free.
- Q: What happens to a transaction's attachments when the transaction is deleted? → A: They are deleted too (files and records); the delete confirmation says how many ("Its 2 attachments are deleted too").
- Q: How early does a warranty count as expiring soon? → A: Two reminders per warranty, set in Settings: a first reminder (default 60 days before expiry) and a second one (default 30 days); the first can be 15, 30, 60 or 90 days, the second 15, 30 or 60 days and always closer to expiry than the first, and the second can be turned off. A reminder is an in-app notice on the Dashboard; "Got it" dismisses it for that warranty until the next reminder (synced across devices).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attach a receipt to a transaction (Priority: P1)

The user records a purchase and attaches the receipt — a photo from the phone or computer, or a PDF bill
— so it is with the transaction when they need it later (a return, a claim, a dispute).

**Why this priority**: Receipts get lost; keeping them with the transaction is the core value.

**Independent Test**: On an existing expense, attach a 4 MB photo and a 300 KB PDF; the transaction shows
both (the photo smaller after compression); opening each shows it; another user can never open them.

**Acceptance Scenarios**:

1. **Given** a transaction, **When** the user attaches a photo (JPEG, PNG, WebP or HEIC) or a PDF, **Then**
   it is saved with the transaction and listed with its name, type, size and date added; photos show a
   small preview.
2. **Given** a large photo, **When** it is attached, **Then** it is made smaller before it is stored (its
   long side at most 2,000 pixels, a few hundred KB) and stays readable; the user is told the size saved.
3. **Given** an attachment, **When** the user opens it, **Then** the photo or PDF is shown or downloaded;
   **When** they delete it (after confirming), **Then** it is gone from the transaction and from storage.
4. **Given** a file that is not a photo or PDF, or a PDF over 10 MB, **When** the user picks it, **Then** it
   is refused with a message saying what is allowed.
5. **Given** a transaction already has 10 attachments, **When** the user adds another, **Then** it is
   refused and the user is told to remove one first.
6. **Given** the user adds an attachment while making a new transaction, **When** they save, **Then** the
   file is attached to that transaction (nothing is stored if they cancel).

---

### User Story 2 - Mark what is under warranty (Priority: P1)

For purchases like a phone, a fridge or a washing machine, the user marks the transaction "Under warranty
until <date>" (and optionally notes the warranty details), and later finds everything still under
warranty, and what expires soon, in one list.

**Why this priority**: Claiming a warranty needs the date and the receipt together; the household tracks
this today by memory and paper.

**Independent Test**: Mark a ₹45,000.00 fridge purchase "under warranty until 14-Nov-2028" with the receipt
attached; the Warranties list shows it with the days left and opens the transaction with its receipt.

**Acceptance Scenarios**:

1. **Given** a transaction, **When** the user turns on "Under warranty" and sets the expiry date (and
   optionally a note such as "2 years, Brand service centre"), **Then** the transaction shows "Under warranty
   until <date>" in words.
2. **Given** warranties, **When** the user opens Warranties, **Then** they see every active warranty with the
   item (payee, notes or category), the purchase date, the expiry date and the time left in words ("3 months
   left", "expires in 12 days", "expired 4 days ago"), soonest first, and whether a receipt is attached.
3. **Given** a warranty that reaches its first reminder (60 days before expiry by default), **When** the user
   opens the Dashboard, **Then** a notice names it with the days left, linking to Warranties; "Got it" hides
   it until the second reminder (30 days by default), when it appears again; expired ones move to an
   "Expired" section of Warranties.
4. **Given** Settings, **When** the user changes the first reminder (15, 30, 60 or 90 days) or the second
   (15, 30, 60 days or off; always closer to expiry than the first), **Then** every warranty uses the new
   days, on every device.
5. **Given** the transaction list, **When** the user filters by "Under warranty", **Then** only those show.
6. **Given** a warranty, **When** the user turns it off, **Then** it leaves the list (the attachments stay).

---

### User Story 3 - Storage stays within the free plan (Priority: P2)

The user sees how much attachment space they use, and the app stops before the household outgrows the
free plan.

**Why this priority**: The project runs on free tiers; files are the thing most likely to outgrow them.

**Independent Test**: Settings › Your data shows "Attachments: 12 files, 3.4 MB of 200 MB"; at the limit,
a new attachment is refused with a clear message.

**Acceptance Scenarios**:

1. **Given** attachments, **When** the user opens Settings › Your data, **Then** they see the number of files
   and the space used against their allowance.
2. **Given** the user's attachments would exceed their allowance, **When** they add one, **Then** it is
   refused with a message saying how much is free.

---

### User Story 4 - Attachments on Android (Priority: P3, Android phase)

Take a receipt photo with the camera and attach it, even offline; the upload waits and is sent when the
phone is back online, exactly once.

**Why this priority**: Web first by the project's build order; the camera and the offline queue are the
phone's.

**Independent Test**: Deferred to the Android phase.

**Acceptance Scenarios**:

1. **Given** the phone offline, **When** the user attaches a photo, **Then** it is shown on the transaction at
   once, marked "Waiting to upload", and uploaded later exactly once.

---

### Edge Cases

- A transaction is deleted: its attachments are deleted with it (files and records), the delete
  confirmation says how many, and its warranty leaves the Warranties list. Deleted on another device while
  offline: the attachments go when that delete reaches the server.
- A transaction is voided: its attachments and warranty stay (a void purchase might still be under
  warranty… or not — the user decides).
- Upload interrupted (network lost on the web): the attachment is not saved and the user is told to try
  again; nothing half-stored remains.
- The same photo attached twice: allowed (two attachments); the user can delete one.
- Hide-balances on: attachment names and previews still show; amounts in the Warranties list are masked.
- Photos keep no location or camera details after compression (they are removed).
- Interest entries and adjustments can carry attachments like other transactions.
- Data reset (R5) and account erasure remove every file of the user from storage.
- The demo household has warranty flags on a few purchases and one or two generated, synthetic receipt
  images.

## Requirements *(mandatory)*

### Functional Requirements

**Attachments**

- **FR-001**: Users MUST be able to attach photos (JPEG, PNG, WebP, HEIC) and PDFs to any of their
  transactions, at most 10 per transaction, and list, open, download and delete them.
- **FR-002**: Photos MUST be compressed on the user's device before upload: long side at most 2,000 px,
  stored as JPEG, location and camera details removed; PDFs are stored as they are, at most 10 MB.
- **FR-003**: Attachments MUST be private to their owner: no other user (including the owner-admin) can list,
  open or download them; links to open a file MUST stop working within minutes.
- **FR-004**: Attachment details (name, type, size, date added, the transaction) MUST sync like other records
  so other devices show them; the files themselves download when opened.
- **FR-005**: Each user MUST have an attachment allowance of 200 MB; an attachment that would exceed it MUST
  be refused with how much is free. Settings MUST show files and space used. Clarified 2026-11-14.
- **FR-006**: Deleting an attachment MUST remove the file from storage. Deleting a transaction MUST delete its
  attachments too (the confirmation says how many). A data reset or account erasure MUST remove every file
  of the user. Clarified 2026-11-14.
- **FR-007**: An attachment MUST be recorded only when its file is stored completely (no record without a
  file); a failed upload leaves nothing behind.

**Warranty**

- **FR-008**: Users MUST be able to mark a transaction "Under warranty" with an expiry date (on or after the
  transaction date) and an optional note (≤ 200 characters), change it, and remove it.
- **FR-009**: A Warranties screen MUST list active warranties soonest-expiring first with item, purchase date,
  expiry, time left in words and whether a receipt is attached, and expired ones in their own section; each
  opens its transaction.
- **FR-010**: Each warranty MUST get two in-app reminders on the Dashboard: the first a set number of days
  before expiry (15, 30, 60 or 90; default 60) and the second closer to expiry (15, 30 or 60, below the
  first; default 30; can be off). A reminder names the item and the days left and links to Warranties;
  "Got it" dismisses it for that warranty until its next reminder, on every device. The two settings are
  in Settings and sync. No notice shows when no reminder is due. Clarified 2026-11-14.
- **FR-011**: The transaction list MUST offer an "Under warranty" filter.
- **FR-012**: Warranty fields MUST sync like other transaction fields (conflicts per field).

**Elsewhere**

- **FR-013**: Amounts shown with warranties MUST go through the app's money display (hide-balances).
- **FR-014**: The demo household (R5) MUST include warranty flags on a few purchases and at least one synthetic
  receipt image.
- **FR-015**: Every attachment added or removed and every warranty change MUST be recorded in the change
  history.

### Key Entities

- **Attachment**: a file kept with one transaction — name, type (photo or PDF), size, date added, the
  transaction; the user's own; synced (details), stored privately (file).
- **Warranty**: on a transaction — under warranty (yes/no), expiry date, note.
- **Allowance**: the space a user's attachments may use, and how much is used.
- **Warranty reminders**: the user's two reminder settings (days before expiry), and for each warranty which
  reminder was last dismissed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user attaches a receipt to a transaction in at most 3 selections (Attach, choose the file,
  confirm), and a 4 MB phone photo is stored at under 1 MB and still readable.
- **SC-002**: No user can open, list or download another user's attachment in any way (tested).
- **SC-003**: Every warranty appears on the Dashboard from its first reminder day until dismissed, again from
  its second reminder day until dismissed, and never otherwise; Warranties always lists it, soonest first.
- **SC-004**: After a data reset or account erasure, none of the user's files remain in storage.
- **SC-005**: Opening an attachment starts showing it within 2 seconds on a normal connection.
- **SC-006**: The attachment and warranty screens pass the accessibility checks used for other screens at
  desktop and phone widths.

## Assumptions

- Files are kept in the existing Supabase project's storage (free tier, 1 GB in all), so no new provider or
  cost; the 200 MB per-user allowance keeps a small household well inside it.
- The web uploads at once (no offline queue on the web); the offline queue and camera capture are the
  phone's (Android phase, US4).
- HEIC photos are converted to JPEG on the device when compressed; a browser that cannot read HEIC asks for a
  JPEG or PNG instead.
- Warranty reminders are in-app only (Dashboard notice, Warranties list); phone notifications stay in
  Phase 2b.
- Attachments belong to a transaction, not to split lines; warranty is per transaction.
- Synthetic data only in the demo environment; no real receipts.

## Dependencies

- R4 transactions (the form, the list and its filters, delete); R5 demo data, reset and erasure; R6 Dashboard.
