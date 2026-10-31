# Feature Specification: Dashboard, Drill-down Reports & Person Statements

**Feature Branch**: `006-dashboard-reports`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "R6 Dashboard, drill-down reports & person statements (roadmap row R6,
depends on R4, R5 for realistic data): a home dashboard (net worth, this month's income and expense,
a safe-to-spend buffer) and interactive charts drilling category → sub-category → payee →
transactions; income vs expense trend; a person statement for any date range — opening balance, each
movement with its type label, signed amount and running balance, closing balance ('You owe X' / 'X
owes you'), with the sign direction set per person; share a statement as a PNG image or PDF (web
download now; Android share sheet in the Android phase). Replaces the R1 Dashboard placeholder. Web
first; Android in the Android phase."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See where I stand at a glance (Priority: P1)

The user opens the app and the Dashboard shows their net worth, what came in and went out this
month, how much is safe to spend after keeping their chosen buffer, what waits in "To confirm", and
the people totals — each figure linking to the screen behind it.

**Why this priority**: The home screen is the first thing every user sees; it replaces the R1
placeholder and turns the recorded data into an answer to "how am I doing?".

**Independent Test**: With the demo household loaded, the Dashboard shows net worth equal to the
Accounts screen's, this month's income and spending equal to the totals of this month's
transactions, and safe to spend that changes when the user changes their buffer.

**Acceptance Scenarios**:

1. **Given** a user with accounts and transactions, **When** they open the Dashboard, **Then** it
   shows net worth (owned, owed and net, exactly as on Accounts), this month's income, spending and
   net, safe to spend, the number waiting in "To confirm", and what people owe them and they owe
   people.
2. **Given** the Dashboard, **When** the user selects any figure, **Then** they land on the matching
   screen (Accounts, the filtered transactions list, To confirm, People).
3. **Given** a buffer amount the user set, **When** the Dashboard is shown, **Then** safe to spend
   equals the money in their counted held accounts minus the buffer, and is shown as "₹0.00" with
   words when the buffer exceeds it.
4. **Given** a new user with no records, **When** they open the Dashboard, **Then** it explains what
   will appear and offers "Add account" and, in the demo environment, "Load demo data".
5. **Given** hide-balances is on, **When** the Dashboard is shown, **Then** every amount is masked.

---

### User Story 2 - Drill into spending and income (Priority: P1)

The user sees a chart of spending (or income) by category for a period, selects a category to see
its sub-categories, then a sub-category to see its payees, then a payee to see the transactions — with
a breadcrumb to go back up at any level.

**Why this priority**: Graphical, interactive reports are the core reason the household wants the
app (scope D24); every later report builds on this drill-down.

**Independent Test**: With the demo household, the user opens Reports, picks last month, selects Food
& groceries → Groceries → Fresh Mart and sees exactly the Fresh Mart grocery transactions of last
month; each level's amounts add up to the level above.

**Acceptance Scenarios**:

1. **Given** a period, **When** the user opens spending by category, **Then** each top-level category
   shows its total including sub-categories and split lines, refunds reduce it, and Uncategorised has
   its own entry; transfers, person movements, interest and uncounted entries are left out.
2. **Given** a category, **When** the user selects it, **Then** its sub-categories (and spending
   recorded on the category itself) are shown with amounts that add up to the category's total.
3. **Given** a category with no sub-categories (or a sub-category), **When** the user selects it,
   **Then** its payees are shown (and "No payee"), adding up to its total.
4. **Given** a payee, **When** the user selects it, **Then** the matching transactions are listed and
   their total equals the payee's amount; each opens the transaction.
5. **Given** any level, **When** the user uses the breadcrumb, **Then** they return to that level with
   the same period.
6. **Given** the same drill-down for income, **When** used, **Then** it behaves the same with income
   categories.
7. **Given** a chart, **When** used by keyboard or screen reader, **Then** every slice or bar can be
   reached and announced with its name, amount and share, and a table view shows the same numbers.

---

### User Story 3 - Income vs spending over time (Priority: P2)

The user sees income and spending month by month for the last 12 months (or a financial year), with
the net for each month, and selects a month to drill into it.

**Why this priority**: Trends show whether the household is saving; it reuses the drill-down.

**Independent Test**: With the demo household, the trend for the last 12 months shows each month's
income, spending and net equal to that month's totals; selecting a month opens the drill-down for it.

**Acceptance Scenarios**:

1. **Given** the trend, **When** shown, **Then** each month has income, spending and net (in words
   when negative), using the same rules as the drill-down.
2. **Given** the trend, **When** the user switches between the last 12 months and an Apr–Mar
   financial year, **Then** the months shown change accordingly.
3. **Given** a month, **When** selected, **Then** the spending drill-down opens for that month.

---

### User Story 4 - A person statement I can share (Priority: P1)

For any person and date range, the user sees a statement: the opening balance, each movement with a
plain-language type ("Lent to", "Received back from", "Interest", …), its signed amount and the running
balance, and the closing balance in words ("You owe Ravi ₹12,000.00" / "Ravi owes you ₹12,000.00").
They choose per person which direction counts as positive, and download the statement as an image or a
PDF to send to the person.

**Why this priority**: The household settles money with relatives and friends monthly and needs a
statement to share (scope D38); it completes the people features of R3–R4.

**Independent Test**: With the demo household, a statement for Ravi Kumar from 01-Apr-2026 to
31-Oct-2026 shows an opening balance equal to his balance at the start of April, each movement in
date order with a running balance, and a closing balance equal to his balance on 31-Oct-2026; the
downloaded image and PDF show the same figures.

**Acceptance Scenarios**:

1. **Given** a person and a date range, **When** the user opens their statement, **Then** it shows
   the opening balance at the start of the range, every counted movement in the range (including split
   shares and confirmed interest) in date order with type, signed amount and running balance, and the
   closing balance at the end of the range.
2. **Given** the person's sign setting "They owe me is positive" (default) or "I owe them is
   positive", **When** the statement is shown, **Then** amounts and balances use that sign, and the
   closing line is in words either way.
3. **Given** a statement, **When** the user downloads it as an image or a PDF, **Then** the file shows
   the person's name, the range, every row and the closing balance, with the household's display name
   and no other person's data.
4. **Given** a range with no movements, **When** shown, **Then** the opening and closing balances are
   equal and the statement says there were no movements.
5. **Given** hide-balances is on, **When** the statement is shown on screen, **Then** amounts are
   masked; a downloaded file shows the real amounts (it is made to be sent).

---

### User Story 5 - Reports and statements on Android (Priority: P3, Android phase)

The same dashboard, drill-down, trend and statements on the phone, with statements shared through the
Android share sheet.

**Why this priority**: Web first (roadmap build order).

**Independent Test**: Deferred to the Android phase.

**Acceptance Scenarios**:

1. **Given** the Android app, **When** the user opens these screens or shares a statement, **Then**
   the figures equal the web's.

---

### Edge Cases

- A period with no transactions: charts say "Nothing recorded in this period" instead of an empty
  chart.
- Very small slices: categories below a small share are grouped as "Other" in the chart but listed in
  full in the table.
- Negative net spending in a category (refunds larger than spending in the period): shown in words
  ("₹500.00 more refunded than spent"), never as a negative slice.
- Archived accounts with a balance still count in net worth as on Accounts; excluded accounts and
  people not in net worth follow the R2/R3 rules exactly.
- Upcoming and awaiting-confirmation transactions and void ones count in no total; deleted ones never
  appear.
- A statement range starting before the person's opening date starts from their opening balance on
  that date.
- Interest proposals still waiting are not in a statement (they are not counted yet).
- Dates are calendar dates in the user's timezone; "this month" follows that timezone.
- 20,000 transactions: dashboard and reports stay within the time limits (SC-003).

## Requirements *(mandatory)*

### Functional Requirements

**Dashboard**

- **FR-001**: The Dashboard MUST show net worth (owned, owed, net) equal to the Accounts screen's;
  this month's income, spending and net; safe to spend; the "To confirm" count; and people owe you /
  you owe people — each linking to its screen.
- **FR-002**: Safe to spend MUST equal the total of the user's held accounts (bank, cash, wallet) that
  count in net worth, minus a buffer amount the user sets (default ₹0.00); never shown below ₹0.00 —
  a shortfall is stated in words.
- **FR-003**: Users MUST be able to set their buffer amount (Settings and from the Dashboard).
- **FR-004**: An empty Dashboard MUST explain what will appear and offer the first steps.

**Reports**

- **FR-005**: Users MUST be able to see spending and income by category for a period (this month, last
  month, this financial year Apr–Mar, last 12 months, or custom dates), and drill category →
  sub-category → payee → transactions with a breadcrumb.
- **FR-006**: Totals at every level MUST follow R4's counting rules (counted = active, confirmed, not
  void; refunds reduce spending; transfers, person movements and interest excluded; split lines
  counted under their own categories) and MUST add up exactly to the level above.
- **FR-007**: Users MUST be able to see income, spending and net per month for the last 12 months or a
  financial year, and open a month's drill-down.
- **FR-008**: Every chart MUST have an equivalent table, be operable by keyboard, announce values to
  screen readers, and never rely on colour alone.

**Person statements**

- **FR-009**: Users MUST be able to open a statement for any person and date range showing opening
  balance, each counted movement in the range with plain-language type, signed amount and running
  balance, and closing balance in words.
- **FR-010**: Each person MUST have a statement sign setting (they owe me positive — default — or I owe
  them positive), synced like other person fields.
- **FR-011**: Users MUST be able to download a statement as a PNG image and as a PDF containing the
  same figures; the file names the person and the range.
- **FR-012**: Statement balances MUST equal the person's balance rules (R3/R4): opening = balance at
  the start of the range; closing = balance at its end.

**General**

- **FR-013**: All amounts MUST go through the app's money display (hide-balances masks them on screen;
  downloaded statements show real amounts).
- **FR-014**: The Dashboard replaces the R1 placeholder; a "Reports" entry joins the main navigation.

### Key Entities

- **Buffer amount**: a per-user preference (paise, ≥ 0) kept from what is safe to spend.
- **Statement sign**: a per-person setting (they owe me positive / I owe them positive).
- **Report period**: a date range chosen from presets or custom dates (not stored).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Dashboard figures equal the Accounts, People and Transactions screens' figures for the
  same data, to the paisa, in every test case.
- **SC-002**: At every drill-down level the parts add up exactly to the whole, for every vector case.
- **SC-003**: With 20,000 transactions, the Dashboard opens within 2 seconds and each drill-down step
  or period change shows within 1 second.
- **SC-004**: A user can go from the Dashboard to the transactions behind one payee's spending in a
  category in 4 selections or fewer.
- **SC-005**: A person statement for a 12-month range downloads as PNG and PDF within 5 seconds, and
  the files' closing balance equals the person's balance at the range end.
- **SC-006**: Every chart passes the accessibility checks used for other screens, with a table
  equivalent.

## Assumptions

- Builds on R2 (net worth), R3 (people, categories), R4 (transactions, counting rules, labels) and R5
  (demo data for realistic charts).
- "This month" and the financial year (Apr–Mar) are in the user's timezone; the financial year start
  month is April (India).
- Safe to spend uses held accounts only (credit cards and people are not money in hand); planned
  payments are added to it by R7 (payment plan).
- The statement shows the household's display name as its source; it contains no account names.
- Charts are rendered in the browser; no external charting or file service is used.
- Android (US5) is deferred to the Android phase.
