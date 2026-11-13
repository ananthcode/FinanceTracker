# Feature Specification: Monthly Payment Plan

**Feature Branch**: `007-payment-plan`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "R7 Monthly payment plan (roadmap row R7, depends on R2, R3, R4; R5 for
the demo plan): a one-screen monthly plan of all planned obligations (EMIs, card bills, rent, fees…)
with planned amount, due date and Paid / Due / Overdue status; per-item frequency (monthly, every N
months, yearly, one-off) and variable amounts; ad-hoc items for a single month; 'Pay' creates a
pre-filled transaction or links an existing one; totals (planned / paid / still to pay); cash needed vs
available balance per account; unpaid items carried forward as overdue; comparison with last month; a
'Money owed to / by people' panel from person ledgers (bank-loan outstanding added in Phase 3).
Replaces the R1 Payment plan placeholder. Web first; Android in the Android phase."

## Clarifications

### Session 2026-11-13

- Q: Can one month's planned payment be paid by more than one transaction? → A: Yes. Several transactions can pay one item-month; it shows Part paid with the amount left until the linked total reaches the planned amount, then Paid. Still to pay counts only what is left, and each transaction pays at most one item-month.
- Q: Should a transaction that clearly matches a plan item mark it paid on its own? → A: Not silently. The plan shows "Looks paid — link?" on an item with a likely match (one selection links it), and the add-transaction form offers "Pays: <item> (<month>)", ticked by default, when the new transaction matches an unpaid item-month; the user can untick it or choose another item.
- Q: For a payment whose amount changes every month, what does the plan show before the month's amount is set? → A: An item marked "amount varies" uses an estimate until the month's amount is set: last month's paid amount, or the usual amount when there is none; a card bill uses the card's current amount owed. Estimates are labelled "estimated". Also (owner addition): from the 25th of a month to the 5th of the next, the Dashboard and Payment plan nudge the user to enter or check the coming month's plan, unless it is already checked.
- Q: When does the coming month's plan count as already entered, so the nudge stops? → A: Only when the user selects "Plan checked" for that month; "Not now" hides the nudge until the next day, and a setting turns the nudge off completely. The nudge appears on both the web app and the Android app (Android in the Android phase).
- Q: When an item's usual amount, due day or pay-from account changes, from which month does the change apply? → A: From the month being viewed (changeable in the form), never earlier than the current month; earlier months keep what they showed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See this month's plan on one screen (Priority: P1)

The user opens Payment plan and sees every payment planned for this month — EMIs, card bills, rent,
school fees, subscriptions — each with its planned amount, due date, the account it is paid from and
its status (Paid, Part paid, Due, Overdue), with totals for planned, paid and still to pay. They can step to
earlier or later months.

**Why this priority**: This is the household's main monthly planning tool today (a spreadsheet of
planned payments highlighted when paid, scope D36); seeing the month at a glance is the core value.

**Independent Test**: With the demo household, the plan for this month lists its items in due-date
order with the right statuses for today's date, and planned = paid + still to pay exactly.

**Acceptance Scenarios**:

1. **Given** plan items exist, **When** the user opens Payment plan, **Then** this month's items are
   listed by due date with name, planned amount, due date, pay-from account and status in words
   (Paid, Part paid, Due, Due today, Overdue, Skipped), never by colour alone.
2. **Given** the month's items, **When** shown, **Then** the totals show planned, paid and still to pay,
   and planned equals paid plus still to pay (skipped items count in none of them).
3. **Given** this month, **When** the user moves to the previous or next month, **Then** that month's
   items and totals are shown; past months show what was paid; future months show what is planned.
4. **Given** no plan items yet, **When** the user opens Payment plan, **Then** it explains what the plan
   is for and offers "Add a planned payment" (and, in the demo environment, loading demo data).

---

### User Story 2 - Set up planned payments (Priority: P1)

The user adds a planned payment once — what it is for, how much, which day it is due, which account
pays it, how often it repeats — and it appears in every month it applies to. Some amounts vary (a card
bill, electricity), so the user can change one month's amount without changing the item. A one-off
item can be added for a single month.

**Why this priority**: Without items there is no plan; frequency and variable amounts are what make
it replace the spreadsheet.

**Independent Test**: Add "Home loan EMI" ₹42,500 monthly on the 5th from Everyday Savings, "Car
insurance" yearly in March, "School fees" every 3 months from April and a one-off "Wedding gift" this
month; each appears in exactly the months it should.

**Acceptance Scenarios**:

1. **Given** the add form, **When** the user saves an item with a name, amount, due day, pay-from
   account, what it pays (a payee and category, a credit-card bill, or a person) and a frequency
   (monthly, every N months, yearly, one-off), **Then** it appears in each month it applies to, from
   its start month until its end month (if any).
2. **Given** an item whose amount varies, **When** the user changes one month's planned amount, **Then**
   only that month changes; the item's usual amount and other months stay as they were.
3. **Given** a month's view, **When** the user adds a one-off item there, **Then** it appears in that
   month only.
4. **Given** an item, **When** the user edits its amount, day or account, **Then** the change applies
   from the month being viewed (the form shows it and allows another month, not earlier than the
   current month) onward, and earlier months keep what they showed.
5. **Given** an item, **When** the user stops it (ends it) or skips one month, **Then** it no longer
   appears after the end month, or that one month shows it as Skipped and it counts in no total.
6. **Given** a due day the month does not have (e.g. the 31st in February), **When** shown, **Then** the
   due date is the month's last day.
7. **Given** an item marked "amount varies" with no amount set for a month, **When** that month is
   shown, **Then** its planned amount is last month's paid amount (or the usual amount when nothing was
   paid last month), or for a card bill the card's current amount owed, labelled "estimated"; setting
   the month's amount replaces the estimate.
8. **Given** today is between the 25th of a month and the 5th of the next, **When** the user opens the
   Dashboard or Payment plan and the coming month's plan is not yet checked, **Then** a nudge says
   "Check your plan for <month>" with how many amounts are still estimated and opens that month; once
   the user selects "Plan checked" the nudge does not appear for that month; "Not now" hides it until
   the next day; with the nudge turned off in Settings it never appears.

---

### User Story 3 - Pay or link, and never record it twice (Priority: P1)

From the plan, the user selects "Pay" on an item: the add-transaction form opens already filled in
(amount, date, account, payee, category or card, notes), and saving it marks the item Paid. If they
already recorded the payment, they link that transaction instead. Either way the payment is recorded
once.

**Why this priority**: Paying from the plan is the daily action; linking avoids double entry, which
would corrupt balances and reports.

**Independent Test**: "Pay" on Rent creates exactly one transaction with the plan's details and marks
Rent Paid; linking an existing electricity bill transaction marks Electricity Paid without creating
another; account balances change once.

**Acceptance Scenarios**:

1. **Given** an unpaid item, **When** the user selects Pay and saves the pre-filled form (changing the
   amount or date if needed), **Then** one transaction is recorded and the item shows Paid with the paid
   amount and date.
2. **Given** an unpaid item, **When** the user selects "Link existing", **Then** likely matches are
   suggested first (same payee or card, amount near what is left, date near the due date) and the user
   can search for any other; linking adds that transaction's amount to what is paid.
3. **Given** a transaction already linked to a plan item, **When** the user tries to link it to another,
   **Then** it is refused with an explanation (it already pays <item> (<month>); unlink it first); a
   transaction pays at most one item-month.
4. **Given** an item-month paid less than planned (e.g. ₹8,000.00 of a ₹20,000.00 card bill), **When**
   shown, **Then** it is Part paid with "₹12,000.00 left", lists each linked transaction, and Pay
   pre-fills the amount left; once the linked total reaches the planned amount it is Paid.
5. **Given** a linked transaction, **When** the user unlinks it, or it is deleted or voided, **Then** its
   amount leaves what is paid (the item may go back to Part paid, Due or Overdue) and unlinking leaves
   the transaction itself unchanged.
6. **Given** linked transactions totalling more than planned, **When** shown, **Then** the item is Paid
   and shows the planned and paid amounts; the totals use the paid amount for "paid".
7. **Given** an unpaid item and an unlinked transaction that likely pays it, **When** the plan is shown,
   **Then** the item says "Looks paid — link?" and one selection links that transaction.
8. **Given** the add-transaction form (not opened from Pay), **When** what is entered likely pays an
   unpaid item-month, **Then** the form offers "Pays: <item> (<month>)", ticked by default, with the
   other likely items and "None" to choose from; saving with it ticked links the transaction.

---

### User Story 4 - Overdue items carry forward; enough money in each account? (Priority: P2)

Anything not paid by its due date shows as Overdue, and if a month ends with it unpaid it is carried
into the next month as Overdue until it is paid or skipped. For the current month, the user sees per
account how much is still to be paid from it against what is in it, and which accounts are short.

**Why this priority**: Missing a payment costs money; knowing which account needs topping up before
due dates is the planning the spreadsheet did by hand.

**Independent Test**: An unpaid September rent appears in October as Overdue with its September due
date; Everyday Savings shows "still to pay ₹68,000.00 · available ₹52,340.50 · short by ₹15,659.50".

**Acceptance Scenarios**:

1. **Given** an unpaid item whose due date has passed, **When** shown, **Then** its status is Overdue
   with how many days late.
2. **Given** an item left unpaid at the end of its month, **When** the user views a later month,
   **Then** it appears there as Overdue (with its original month and due date) until it is paid or
   skipped, and it counts in that month's still to pay — once, not in every month after.
3. **Given** this month, **When** shown, **Then** each pay-from account lists still to pay (due and
   overdue), its current balance (for a credit card, the credit still available when a limit is set)
   and "short by" when still to pay is larger.
4. **Given** paying an overdue item, **When** done, **Then** it leaves every month's still to pay.

---

### User Story 5 - Compare with last month; money owed to and by people (Priority: P2)

The user sees how this month's plan compares with last month (planned and paid, in total and per
item), and a panel of money owed to them and by them from their people (the person ledgers), so all
their obligations are in one place.

**Why this priority**: The comparison catches surprises (a bill that jumped); the people panel
completes the obligations picture (scope D36, D37).

**Independent Test**: With the demo household, the comparison shows last month's paid total and the
difference in words ("₹3,200.00 more than last month"); the people panel shows each person with a
balance and the same totals as the People screen.

**Acceptance Scenarios**:

1. **Given** this month and last month, **When** shown, **Then** totals planned and paid for both and
   the difference are shown in words ("more" / "less" / "same"), and each item shows last month's paid
   amount beside this month's planned amount.
2. **Given** people with balances, **When** the panel is shown, **Then** each person with a non-zero
   balance appears with their balance in words ("owes you" / "you owe"), and the totals equal the People
   screen's; selecting a person opens them.
3. **Given** bank loans (Phase 3), **When** they exist later, **Then** their outstanding amounts join
   this panel (not part of this module).

---

### User Story 6 - The plan on Android (Priority: P3, Android phase)

The same plan, Pay and link on the phone, working offline and syncing.

**Why this priority**: Web first by the project's build order; the Android client follows in the
Android phase.

**Independent Test**: Deferred to the Android phase.

**Acceptance Scenarios**:

1. **Given** the Android app, **When** the user opens the plan, pays or links an item, **Then** it
   behaves as on the web and syncs.
2. **Given** the Android app between the 25th and the 5th, **When** the coming month is not checked and
   the nudge setting is on, **Then** the same month-check nudge appears (FR-023); "Plan checked" on
   either client stops it on both.

---

### Edge Cases

- An item created mid-month starts in the month chosen; a past start month shows its earlier months as
  unpaid (and so overdue) unless the user starts it from this month — the form defaults to this month.
- An item's pay-from account is archived: the item still shows; Pay asks for another account.
- A payee, category or person an item uses is merged: the item follows the merge (as transactions do,
  R3); if deleted, the item keeps its name and asks for a new one on Pay.
- The linked transaction's date is in another month (paid early or late): the item is Paid in its own
  plan month; the transaction stays in its own month for reports.
- A transaction is linked and then edited (amount, date): the item shows the new paid amount and date.
- A credit-card bill item: Pay records a transfer from the pay-from account to the card; when the
  amount varies and none is set for the month, the estimate is the card's amount owed plus what is
  already paid that month (FR-006).
- A person item (e.g. monthly repayment to a relative): Pay records the person movement ("Repaid to",
  "Lent to"), which updates the person's balance.
- Every N months with N from 2 to 12; yearly = every 12 months from its start month.
- Months far in the future or past: the user can view any month from the earliest item start to 24
  months ahead.
- Hide-balances on: every amount on the screen is masked; statuses and words remain.
- Data reset (R5): plan items go with the user's other records; demo data includes a plan.

## Requirements *(mandatory)*

### Functional Requirements

**The plan**

- **FR-001**: The Payment plan screen MUST show one month at a time (default: this month in the user's
  timezone) with every applicable item: name, planned amount, due date, pay-from account, what it pays,
  status in words and, when paid, the paid amount and date and a link to the transaction.
- **FR-002**: Status MUST be one of Paid (linked total ≥ planned), Part paid (some linked, with the
  amount left), Due, Due today, Overdue (with days late; an overdue item can also be part paid) or
  Skipped, from the linked total, the item's due date and today's date; never shown by colour alone.
- **FR-003**: The screen MUST show totals for the month: planned (all non-skipped items, including
  overdue ones carried in), paid (linked amounts) and still to pay (for each item, planned − paid when
  positive, else 0), with planned = paid + still to pay − overpaid exactly, where overpaid is what
  linked transactions pay above an item's plan (shown when not zero).
- **FR-004**: Users MUST be able to move to any month from the earliest item's start to 24 months
  ahead.

**Items**

- **FR-005**: Users MUST be able to create, edit, end and delete plan items with: name (1–60 chars),
  usual amount (> 0; optional for card bills), due day (1–31), pay-from account, what it pays (payee
  with optional category; a credit card; or a person with the movement type), frequency (monthly, every
  N months for N 2–12, yearly, one-off), start month and optional end month, whether the amount varies,
  and notes.
- **FR-006**: Users MUST be able to set one month's planned amount for an item without changing the
  item, and to skip one month. For an item marked "amount varies" with no amount set for the month, the
  planned amount MUST be an estimate labelled "estimated": the previous month's paid amount for that
  item, or the usual amount when nothing was paid; for a card bill, the card's current amount owed plus
  what is already paid toward that month, so a part payment does not shrink the plan (shown only for
  the current and coming months; past months use the usual amount). Clarified 2026-11-13.
- **FR-007**: Users MUST be able to add a one-off item from a month's view; it applies to that month
  only.
- **FR-008**: Edits to an item's amount, due day or account MUST apply from a chosen month onward —
  by default the month being viewed, never earlier than the current month (clarified 2026-11-13);
  earlier months keep what they showed. Changing an item's start month, end month or frequency MUST NOT
  drop a month that has linked payments. Deleting an item MUST keep its paid months (shown under the
  item's name as removed) and remove everything else of it.
- **FR-009**: Plan items MUST be the user's own and synced like other records (offline edits on later
  clients; conflicts resolved per field, as R2–R4).

**Paying**

- **FR-010**: "Pay" MUST open the add-transaction form pre-filled from the item — the month's amount,
  today's date, the pay-from account, and the payee and category (or a transfer to the card, or the
  person movement), with the item's name in notes; the amount is what is left to pay for that month; the
  user can change any of it — and saving MUST link the transaction to that month's item.
- **FR-011**: "Link existing" MUST suggest likely transactions (same payee/card/person, amount within
  ±20 % of what is left, date within the month or 10 days around the due date, not already linked) and
  allow searching any transaction. An item-month MAY have several linked transactions; a transaction
  MUST link to at most one item-month.
- **FR-012**: Unlinking, deleting or voiding a linked transaction MUST remove its amount from what is
  paid (the item may become Part paid or unpaid again); unlinking MUST NOT change the transaction.
- **FR-013**: An item-month is paid only through links the user makes; nothing links silently. A
  "likely match" is an active, unlinked transaction to the same payee, card or person, with an amount
  within ±20 % of what is left and a date within 10 days of the due date or in the item's month. The plan
  MUST show "Looks paid — link?" on an item-month with a likely match (one selection links it), and the
  add-transaction form MUST offer "Pays: <item> (<month>)", ticked by default, when the transaction
  being entered is a likely match for an unpaid item-month (best match first; other matches and "None"
  selectable). Clarified 2026-11-13.

**Overdue and cash**

- **FR-014**: An item-month unpaid after its month ends MUST appear in each later month's view as
  Overdue with its own month and due date, counted in the still to pay of the current month only (no
  double counting across months), until paid or skipped.
- **FR-015**: For the current month, the screen MUST show per pay-from account: still to pay (due and
  overdue), its current balance (for a credit card with a limit, the available credit) and the shortfall
  in words when still to pay is larger.

**Comparison and people**

- **FR-016**: The screen MUST compare the month with the previous month: planned and paid totals and the
  difference in words, and per item last month's paid amount.
- **FR-017**: The screen MUST show a "Money owed to / by people" panel listing people with non-zero
  balances (words for direction) and totals equal to the People screen; bank-loan outstanding joins it
  in Phase 3.

**Elsewhere**

- **FR-018**: Safe to spend (R6) MUST also subtract this month's unpaid plan items (due and overdue)
  paid from accounts counted in net worth, except card-bill transfers (card owed is already subtracted)
  and items already counted through a linked upcoming transaction — nothing is subtracted twice.
- **FR-019**: The demo household (R5) MUST include a plan (EMIs, rent, card bills, school fees, yearly
  insurance, a person repayment) with past months paid through links and at least one overdue item.
- **FR-020**: The transaction screen MUST show when a transaction pays a plan item (with the item's name
  and month) and warn before deleting or voiding it that the item will become unpaid.
- **FR-021**: All amounts MUST go through the app's money display (hide-balances masks them).
- **FR-022**: The "Payment plan" navigation entry MUST open this screen (replacing the R1 placeholder).
- **FR-023**: From the 25th of a month to the end of that month, and from the 1st to the 5th of a month
  (dates in the user's timezone), the Dashboard and the Payment plan screen MUST show a nudge to check
  the coming month's plan (from the 25th: next month; from the 1st to the 5th: this month), with the
  number of amounts still estimated, opening that month. The month counts as entered, and no nudge
  appears for it, only once the user has selected "Plan checked" for it (offered on the nudge and on that
  month's plan view — the month the nudge is about: this month from the 1st to the 5th, otherwise next
  month; the choice syncs to the user's other clients, and checking a month also counts the months
  before it as checked). "Not now" hides the nudge until the
  next day on that client. A setting ("Remind me to check next month's plan", on by default, synced)
  turns the nudge off completely. The nudge MUST appear in both the web app and the Android app
  (Android in the Android phase, US6); it is in-app only (no phone or email notification). Added by the
  owner and clarified 2026-11-13.

### Key Entities

- **Plan item**: what is planned — name, usual amount, due day, pay-from account, target (payee and
  category / credit card / person and movement type), frequency (monthly, every N months, yearly,
  one-off), start month, optional end month, amount varies (yes/no), notes; changes take effect from a
  month onward.
- **Item month (occurrence)**: one item in one month — planned amount (set for that month, else the
  usual amount or, when the amount varies, the estimate), due date, skipped or not, and the linked
  transactions. Recorded when the user changes, skips or pays it; otherwise derived from the item.
- **Month check**: the latest month whose plan the user marked checked (FR-023); that month and the
  months before it count as checked. One per user, synced with the user's preferences. A user
  preference turns the nudge on or off (on by default).
- **Payment link**: a transaction paying (part of) one item month; an item month can have several; a
  transaction has at most one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any month, planned = paid + still to pay − overpaid exactly, and paid equals the sum
  of the linked transactions' amounts.
- **SC-002**: A payment is recorded once: paying from the plan or linking never creates a second
  transaction, and account balances change once.
- **SC-003**: With 100 items and 24 months of history, the plan screen is complete within 2 seconds
  and moving to another month within 1 second.
- **SC-004**: A user can pay a due item from the plan in at most 3 selections (Pay, check, Save) and set
  up a monthly item in under 1 minute.
- **SC-005**: Every unpaid past item appears as Overdue in the current month exactly once until paid
  or skipped.
- **SC-006**: The people panel's totals equal the People screen's, and safe to spend changes by exactly
  the unpaid plan items it should subtract.
- **SC-007**: The screen passes the accessibility checks used for other screens at desktop and phone
  widths.
- **SC-008**: With the setting on, the month-check nudge appears on every day from the 25th to the 5th
  while the coming month is not checked and not put off with "Not now" that day, on no other day, and
  never for a month already checked; with the setting off it never appears.

## Assumptions

- Statuses use the user's timezone for "today"; "Due today" is the due date; "Due" is any later date in
  the month.
- Part payments are linked transactions adding up (clarified 2026-11-13); a smaller total is Part
  paid, an equal or larger one Paid.
- Paid status comes only from links the user makes (FR-013); matching only suggests, in the plan and
  in the add-transaction form (clarified 2026-11-13).
- Deleting an item that has paid months keeps those months' records (shown under the item's old name);
  deleting one with none removes it entirely.
- Card-bill items marked "amount varies" are estimated from the card's current amount owed (plus what
  is already paid that month) until the month's amount is set; other varying items from last month's paid amount (clarified 2026-11-13).
- The month-check nudge (FR-023) is an in-app prompt on web and Android; phone notifications and
  reminders stay in Phase 2b. "Not now" is remembered per client, not synced.
- The plan's months are calendar months; financial-year views are not needed.
- Scheduling, auto-posting and reminders (Phase 2b) and bank loans with EMI schedules (Phase 3) are out
  of scope; they build on these plan items later.
- Android (US6) is deferred to the Android phase, as for R2–R6.
- Synthetic data only in the demo environment; no real data.

## Dependencies

- R2 accounts and balances (pay-from accounts, available balance, credit limit).
- R3 payees, categories and people (targets; merges).
- R4 transactions (Pay pre-fills the form; links; void and delete), upcoming transactions.
- R5 demo data (the demo plan); R6 safe to spend (FR-018).
