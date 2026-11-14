# Feature Specification: Quick-add Templates

**Feature Branch**: `008-quick-add-templates`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "R8 Quick-add templates (roadmap row R8, depends on R4; P1): saved one-tap
entries for frequent transactions, optimised for mobile. A template holds what a transaction needs
except what changes each time (type, account, payee, category or split, tags, notes, usual amount which
may be left blank); one tap records it for today or opens the add form pre-filled; templates are listed
in an order the user sets, can be created from an existing transaction, edited, hidden or deleted, and
sync like other records. Web first; Android (where one-tap matters most) in the Android phase."

## Clarifications

### Session 2026-11-14

- Q: When a one-tap recording matches an unpaid planned payment, is it linked to the plan? → A: Only through a tie the user set up: a template can be tied to one planned payment ("Pays a planned payment"), and recording from it links the transaction to that item's unpaid month — the oldest month with something left, else none (the transaction is still recorded, and the message says it was not linked). Untied templates never link; the plan shows "Looks paid — link?" as usual.
- Q: How does a one-tap recording guard against a wrong template or a double tap? → A: It records at once and says "Recorded …" with Undo for 10 seconds; selecting the same template again within those 10 seconds asks "Record it again?" before recording.
- Q: Where does the quick-add list appear on the web? → A: On the Transactions screen, as "Start from a template" in the add-transaction form, and as a short "Quick add" strip on the Dashboard showing the first 6 visible templates (in the user's order) with a "More" link to Transactions.
- Q: What does the amount show when recording a template? → A: Each quick-add item has an amount box beside Record. With a usual amount, the box shows it selected — Record uses it (one tap), or typing replaces it for this transaction only (the template keeps its amount). Without a usual amount, the box is empty ("Enter amount") and the user types the amount each time; nothing is remembered from last time. Recording happens straight from the list in both cases; Edit first still opens the full form. A split template's amount cannot be changed from the list (its lines must add up): a different amount opens the form.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record a frequent transaction in one tap (Priority: P1)

The user buys milk every morning, tops up the wallet every week and pays the maid every month. Each of
these is a template. From the quick-add list the user selects one and it is recorded at once for today,
with its usual amount, account, payee, category, tags and notes. When the amount varies (groceries, fuel)
they type it in the template's amount box and record, still without opening the form. If they tapped the
wrong one, they undo it right there.

**Why this priority**: Recording the same small transactions again and again is the most frequent thing
the household does; making it one selection is the whole value of the module.

**Independent Test**: With a template "Milk — ₹60.00 from Cash in hand, Sunrise Dairy, Food &
groceries › Milk & dairy", one selection records exactly one transaction dated today with those details;
Cash in hand falls by ₹60.00 once; Undo removes it again.

**Acceptance Scenarios**:

1. **Given** a template with a usual amount, **When** the user selects "Record" on it, **Then** one
   transaction is recorded for today with the template's type, account(s), amount, payee or person,
   category or split lines, tags and notes, and the user is told what was recorded ("Recorded Milk,
   ₹60.00, today") with an Undo.
2. **Given** a transaction just recorded from a template, **When** the user selects Undo while it is
   offered, **Then** that transaction is removed and every balance and total is as before.
3. **Given** a template with no usual amount, **When** the user types an amount in its amount box and
   selects Record, **Then** one transaction is recorded for today with that amount; with the box empty,
   Record is refused with "Enter the amount" and nothing is recorded. Nothing from earlier recordings is
   pre-filled.
4. **Given** a template with a usual amount, **When** the user types a different amount in its box and
   selects Record, **Then** the transaction uses the typed amount and the template keeps its usual amount.
5. **Given** a split template, **When** the user changes the amount in its box, **Then** the form opens
   filled in with the new amount so the lines can be adjusted; recording at its usual amount stays one tap.
6. **Given** any template, **When** the user chooses "Edit first", **Then** the add-transaction form
   opens filled in from the template (amount included), so they can change the date, amount or anything
   else before saving.
7. **Given** a template whose account has since been archived or deleted, or whose payee, person,
   category or tag has been deleted, **When** the user selects it, **Then** nothing is recorded silently:
   the form opens filled in with that field empty and says what needs choosing.
8. **Given** the user selects the same template twice within a few seconds, **When** the second
   selection happens, **Then** they are asked whether to record it again, so a double tap never records
   twice by accident.
9. **Given** a template tied to a planned payment (e.g. Rent), **When** the user records it, **Then** the
   transaction is linked to that item's oldest month with something left (this month, or an overdue
   month carried over), the message says so ("… · pays Rent (November 2026)"), and Undo removes both the
   transaction and the payment.
10. **Given** a tied template whose planned payment has nothing left to pay, or has been ended or deleted,
   **When** the user records it, **Then** the transaction is recorded without a link and the message says
   why ("Rent is already paid for November; not linked" / "That planned payment no longer exists").

---

### User Story 2 - Make and manage templates (Priority: P1)

The user creates templates from scratch or from a transaction they already recorded ("Save as
template"), gives each a short name, and arranges the list in the order they use them. Templates they
no longer need are hidden (kept, but off the quick-add list) or deleted.

**Why this priority**: Without templates there is nothing to tap; making one from an existing
transaction is the fastest way to build the list.

**Independent Test**: "Save as template" on a recorded grocery expense creates a template with its
details and amount; moving it to the top shows it first in the quick-add list on this device and, after
sync, on the user's other devices; hiding it removes it from the list but keeps it in Manage templates.

**Acceptance Scenarios**:

1. **Given** the template form, **When** the user saves a name (1–40 characters, unique among their
   templates ignoring case), a type (expense, income, refund, transfer or person movement), the
   account(s), and optionally a usual amount, payee or person (with the movement type), category or split
   lines, tags and notes, **Then** the template appears in the quick-add list.
   The form also offers "Pays a planned payment" (optional): one of the user's live planned payments whose
   type fits the template (a transfer to the card for a card bill, the person and movement for a person
   item, an expense for the rest).
2. **Given** a recorded transaction, **When** the user selects "Save as template", **Then** the template
   form opens with the transaction's details (date and status left out) and its name suggested from the
   payee or notes; saving creates the template.
3. **Given** several templates, **When** the user moves one up or down (or to the top), **Then** the
   quick-add list shows them in that order everywhere.
4. **Given** a template, **When** the user edits it, **Then** later recordings use the new details;
   transactions already recorded from it do not change.
5. **Given** a template, **When** the user hides it, **Then** it leaves the quick-add list but stays in
   Manage templates, from where it can be shown again; **When** the user deletes it, **Then** it is gone
   and transactions recorded from it are unchanged.
6. **Given** a split template, **When** it is saved, **Then** its lines add up to its amount (a split
   template must have an amount).

---

### User Story 3 - Quick add where it is needed (Priority: P2)

On the web the quick-add list is on the Transactions screen, at the top of the add-transaction form
("Start from a template") and, for the first few templates, on the Dashboard where the app opens; on the
phone it will be the first thing on the home screen.

**Why this priority**: One tap only helps if the list is where the user already goes to record.

**Independent Test**: The Transactions screen shows the visible templates in the user's order with their
usual amounts; the add-transaction form offers "Start from a template", which fills the form.

**Acceptance Scenarios**:

1. **Given** visible templates, **When** the user opens Transactions, **Then** a quick-add list shows each
   one's name and its amount box (the usual amount, or empty with "Enter amount"), with Record and Edit
   first, in the user's order.
2. **Given** the add-transaction form, **When** the user chooses a template under "Start from a
   template", **Then** the form is filled in from it and nothing is saved until they save.
3. **Given** no templates yet, **When** the user opens Transactions, **Then** the quick-add area explains
   templates and offers "Make a template" (and the demo household has some).
4. **Given** visible templates, **When** the user opens the Dashboard, **Then** a "Quick add" strip shows
   the first 6 in the user's order with Record (and Edit first), and "More" opens the full list on
   Transactions; with no visible templates the strip is not shown.

---

### User Story 4 - Templates on Android (Priority: P3, Android phase)

The same templates on the phone's home screen, recording in one tap even offline, and syncing.

**Why this priority**: Web first by the project's build order; the phone is where one tap matters most,
and it follows in the Android phase.

**Independent Test**: Deferred to the Android phase.

**Acceptance Scenarios**:

1. **Given** the Android app offline, **When** the user records a template, **Then** the transaction is
   saved on the phone, balances update at once, and it syncs later exactly once.

---

### Edge Cases

- A template for a person movement records the movement and changes the person's balance, as the R4
  form does; adjustments and interest are not templates (they need a reason or come from a rate).
- A transfer template needs two different accounts.
- A template for a credit card bill or rent that matches an unpaid planned payment (R7): it links only
  when the template is tied to that planned payment (FR-012); otherwise the plan shows "Looks paid —
  link?".
- A tied template whose type, payee, card or person no longer fits the planned payment (both edited
  since): recording still records it; the link is refused and the message says the template no longer
  fits that planned payment.
- A payee, category or tag the template uses is merged: the template follows the merge (as transactions
  and plan items do). A hidden payee or category stays usable in the template.
- Hide-balances on: every amount in the quick-add list and Manage templates is masked; names and words
  remain.
- Many templates: the quick-add list shows the visible ones in order; the limit is 100 templates per user.
- The base currency is the only currency (R2); a template's amount is in it.
- Data reset (R5) removes templates with the user's other records; the demo household includes some.
- Two devices edit the same template offline: fields resolve as other records do (latest change per
  field wins); the split lines and amount travel together.

## Requirements *(mandatory)*

### Functional Requirements

**Templates**

- **FR-001**: Users MUST be able to create, edit, hide, show again and delete templates with: name (1–40
  characters, unique among the user's templates ignoring case), type (expense, income, refund, transfer,
  person movement other than adjustment), account (and to-account for a transfer), optional usual amount
  (> 0), optional payee (a person, with the movement type, for person movements), optional category or
  split lines (as R4), optional tags and optional notes.
- **FR-002**: A split template MUST have an amount, and its lines MUST add up to it exactly.
- **FR-003**: Users MUST be able to create a template from a recorded transaction ("Save as template"),
  starting from its details without its date, time, status, reference or plan link.
- **FR-004**: Users MUST be able to set the order of their templates; the order MUST be the same on every
  device.
- **FR-005**: Templates MUST be the user's own and synced like other records (offline edits on later
  clients; conflicts resolved per field, as R2–R4); at most 100 per user.
- **FR-006**: Editing or deleting a template MUST NOT change transactions already recorded from it.

**Recording**

- **FR-007**: "Record" MUST record exactly one transaction dated today (in the user's timezone) with the
  template's details and the amount in its box, counted at once as any transaction dated today.
- **FR-008**: After a one-tap recording the user MUST be told what was recorded and offered Undo for at
  least 10 seconds; Undo MUST delete that transaction (as the R4 delete does).
- **FR-009**: A second Record on the same template within 10 seconds MUST ask before recording again.
- **FR-010**: Each quick-add item MUST have an amount box beside Record: showing the usual amount
  (selected, so typing replaces it) or, without one, empty with "Enter amount". Record MUST use the amount
  in the box for that transaction only; it MUST NOT change the template, and nothing from earlier
  recordings is pre-filled. An empty or invalid amount MUST be refused with a message and record nothing.
  A split template whose amount is changed in the box MUST open the form instead (the lines must add up).
  "Edit first" MUST open the add-transaction form filled in from the template; nothing is recorded until
  the user saves. Clarified 2026-11-14.
- **FR-011**: When anything the template refers to is archived or deleted, Record MUST NOT record; it MUST
  open the form filled in, with that field empty and a message saying what to choose.
- **FR-012**: A template MAY be tied to one of the user's planned payments (R7) whose kind fits it. Recording
  a tied template MUST link the transaction to that item's oldest month with something left (FR-014 of
  R7: overdue months first, then this month); when nothing is left, or the item is ended or deleted, the
  transaction MUST still be recorded, unlinked, and the message MUST say why. "Edit first" on a tied
  template opens the form with "Pays: <item> (<month>)" ticked, as Pay does. Untied templates never link:
  R7's rule applies (the plan shows "Looks paid — link?"; the form offers "Pays:"). Clarified 2026-11-14.

**Where**

- **FR-013**: The Transactions screen MUST show the visible templates in the user's order with name, the
  amount box, Record and Edit first; the add-transaction form MUST offer "Start from a
  template"; the Dashboard MUST show a "Quick add" strip with the first 6 visible templates and a "More"
  link (hidden when there are none). Manage templates (create, edit, order, hide, delete) MUST be
  reachable from Transactions and the form. Clarified 2026-11-14.
- **FR-014**: All amounts MUST go through the app's money display (hide-balances masks them).
- **FR-015**: Payee, category and tag merges MUST carry over to templates; deleting a tag MUST remove it
  from templates.
- **FR-016**: The demo household (R5) MUST include a few templates (e.g. milk, wallet top-up, fuel, a
  repayment to a person); data reset and account erasure MUST remove the user's templates.
- **FR-017**: Every template change MUST be recorded in the change history as other records are.

### Key Entities

- **Template**: a named, ordered starting point for a transaction — type, account(s), optional usual
  amount, payee or person and movement type, category or split lines, tags, notes, optionally the planned
  payment it pays; visible or hidden; the user's own; synced.
- **Recording**: an ordinary transaction made from a template; it keeps no tie to the template, so later
  template edits never change it. A recording from a tied template carries an ordinary R7 payment link,
  which can be unlinked like any other.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user records a frequent transaction with a usual amount in 1 selection, and with an amount
  that varies in 2 (type the amount, Record), without opening the form.
- **SC-002**: Every one-tap recording creates exactly one transaction; a double tap never creates two
  without the user confirming; Undo leaves balances exactly as before.
- **SC-003**: Making a template from an existing transaction takes under 30 seconds.
- **SC-004**: With 100 templates the quick-add list is shown within 1 second, and a recording appears in
  balances within 1 second of the selection.
- **SC-005**: The order and visibility the user sets are the same on every device after sync.
- **SC-006**: The quick-add list, Manage templates and the template form pass the accessibility checks
  used for other screens at desktop and phone widths, and work by keyboard alone.

## Assumptions

- A recording is an ordinary transaction (R4): dated today, confirmed, status Uncleared; it can be edited
  or deleted like any other.
- Templates store no date; "Edit first" lets the user pick a past or future date (a future one becomes
  upcoming, as R4).
- Only one currency exists (R2), so templates carry no currency.
- Undo is offered on the screen where Record was selected; after that the transaction is deleted the
  usual way.
- Phone notifications, home-screen widgets and voice entry are out of scope; scheduled automatic
  recording belongs to Phase 2b (with R7's plan items).
- Android (US4) is deferred to the Android phase, as for R2–R7; the phone's sync learns the new entity in
  this module so it is ready.
- Synthetic data only in the demo environment; no real data.

## Dependencies

- R2 accounts; R3 payees, people, categories and tags (and their merges); R4 transactions (the form, splits,
  person movements, delete); R5 demo data and reset; R7 plan linking rule (FR-012).
