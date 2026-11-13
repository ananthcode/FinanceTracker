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

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See this month's plan on one screen (Priority: P1)

The user opens Payment plan and sees every payment planned for this month — EMIs, card bills, rent,
school fees, subscriptions — each with its planned amount, due date, the account it is paid from and
its status (Paid, Due, Overdue), with totals for planned, paid and still to pay. They can step to
earlier or later months.

**Why this priority**: This is the household's main monthly planning tool today (a spreadsheet of
planned payments highlighted when paid, scope D36); seeing the month at a glance is the core value.

**Independent Test**: With the demo household, the plan for this month lists its items in due-date
order with the right statuses for today's date, and planned = paid + still to pay exactly.

**Acceptance Scenarios**:

1. **Given** plan items exist, **When** the user opens Payment plan, **Then** this month's items are
   listed by due date with name, planned amount, due date, pay-from account and status in words
   (Paid, Due, Due today, Overdue, Skipped), never by colour alone.
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
   from the current month onward and earlier months keep what they showed.
5. **Given** an item, **When** the user stops it (ends it) or skips one month, **Then** it no longer
   appears after the end month, or that one month shows it as Skipped and it counts in no total.
6. **Given** a due day the month does not have (e.g. the 31st in February), **When** shown, **Then** the
   due date is the month's last day.

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
   suggested first (same payee or card, amount near the plan, date near the due date) and the user can
   search for any other; linking marks the item Paid with that transaction's amount and date.
3. **Given** a transaction already linked to a plan item, **When** the user tries to link it to another,
   **Then** it is refused with an explanation; a transaction pays at most one plan item.
4. **Given** a paid item, **When** the user unlinks it, or its transaction is deleted or voided, **Then**
   the item becomes unpaid again (Due or Overdue) and the transaction itself is unchanged by unlinking.
5. **Given** a paid amount different from the planned amount, **When** shown, **Then** the item shows
   both, and the totals use the paid amount for "paid".

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
- A credit-card bill item: Pay records a transfer from the pay-from account to the card; the amount
  defaults to the card's amount owed when no amount is planned for the month.
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
- **FR-002**: Status MUST be one of Paid, Due, Due today, Overdue (with days late) or Skipped, from the
  item's due date and today's date; never shown by colour alone.
- **FR-003**: The screen MUST show totals for the month: planned (all non-skipped items, including
  overdue ones carried in), paid and still to pay, with planned = paid + still to pay exactly, where an
  item paid at a different amount counts its paid amount in "paid" and nothing in "still to pay".
- **FR-004**: Users MUST be able to move to any month from the earliest item's start to 24 months
  ahead.

**Items**

- **FR-005**: Users MUST be able to create, edit, end and delete plan items with: name (1–60 chars),
  usual amount (> 0; optional for card bills), due day (1–31), pay-from account, what it pays (payee
  with optional category; a credit card; or a person with the movement type), frequency (monthly, every
  N months for N 2–12, yearly, one-off), start month and optional end month, and notes.
- **FR-006**: Users MUST be able to set one month's planned amount for an item without changing the
  item, and to skip one month.
- **FR-007**: Users MUST be able to add a one-off item from a month's view; it applies to that month
  only.
- **FR-008**: Edits to an item's amount, due day or account MUST apply from the current month onward;
  earlier months keep what they showed. Deleting an item MUST keep its paid months (shown under the
  item's name as removed) and remove everything else of it.
- **FR-009**: Plan items MUST be the user's own and synced like other records (offline edits on later
  clients; conflicts resolved per field, as R2–R4).

**Paying**

- **FR-010**: "Pay" MUST open the add-transaction form pre-filled from the item — the month's amount,
  today's date, the pay-from account, and the payee and category (or a transfer to the card, or the
  person movement), with the item's name in notes; the user can change any of it — and saving MUST link
  the transaction to that month's item.
- **FR-011**: "Link existing" MUST suggest likely transactions (same payee/card/person, amount within
  ±20 % of the plan, date within the month or 10 days around the due date, not already linked) and allow
  searching any transaction; a transaction MUST link to at most one item-month.
- **FR-012**: Unlinking, deleting or voiding the linked transaction MUST return the item to unpaid;
  unlinking MUST NOT change the transaction.
- **FR-013**: An item-month is paid only through a link (Pay or Link existing); recording a similar
  transaction elsewhere MUST NOT mark it paid on its own, but the plan MAY suggest it ("Looks paid —
  link?").

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

### Key Entities

- **Plan item**: what is planned — name, usual amount, due day, pay-from account, target (payee and
  category / credit card / person and movement type), frequency (monthly, every N months, yearly,
  one-off), start month, optional end month, notes; changes take effect from a month onward.
- **Item month (occurrence)**: one item in one month — planned amount (usual or set for that month),
  due date, skipped or not, and the linked transaction when paid. Recorded when the user changes,
  skips or pays it; otherwise derived from the item.
- **Payment link**: a transaction paying one item month; at most one per transaction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any month, planned = paid + still to pay exactly, and paid equals the sum of the
  linked transactions' amounts.
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

## Assumptions

- Statuses use the user's timezone for "today"; "Due today" is the due date; "Due" is any later date in
  the month.
- An item paid with a different amount counts as Paid (no partial payments in this module); the
  difference is shown.
- Paid status comes only from links (FR-013); automatic matching is a suggestion, not an action.
- Deleting an item that has paid months keeps those months' records (shown under the item's old name);
  deleting one with none removes it entirely.
- Card-bill items default to the card's current amount owed when no amount is planned for the month.
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
