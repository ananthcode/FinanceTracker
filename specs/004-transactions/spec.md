# Feature Specification: Transactions

**Feature Branch**: `004-transactions`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "Roadmap capability R4 (ROADMAP.md) — Transactions: record income, expense
and transfers (excluded from income/expense totals); split lines; payee, category, tags, notes,
reference no., status; person-ledger movements — borrowed from / lent to a person, repaid, paid on
behalf of and collected on behalf of a person — which update their balance and are excluded from own
spending/income; interest on person loans per person with a rate history (changes only from the 1st
of a month), auto-accrued at month-end as that month's rate × the month's opening balance (compounds
monthly, overridable) or entered manually; search, filter, bulk edit; relocate (moved here from R3);
offline entry (Android phase); full edit history. Web first."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record spending and income (Priority: P1)

A signed-in user records what they spend and earn: the date, the account the money left or arrived
in, the amount, a payee and a category, and optionally tags, notes and a reference number. Account
balances, net worth and the people totals update at once.

**Why this priority**: Recording money in and out is the core of the app; every report, the payment
plan and reconciliation build on these records.

**Independent Test**: Asha (synthetic user) records "Fresh Mart, ₹1,234.50, Groceries, paid from
Everyday Savings, 05-Oct-2026" and "Acme Payroll, ₹85,000.00, Salary, into Everyday Savings,
01-Oct-2026". Everyday Savings goes up by ₹83,765.50, and both appear in the transactions list,
newest first.

**Acceptance Scenarios**:

1. **Given** the add form, **When** the user chooses Expense, enters a date, account, amount, payee
   and an expense category and saves, **Then** the transaction appears in the list and the account's
   balance falls by the amount (a credit card's amount owed rises instead).
2. **Given** the add form, **When** the user chooses Income with an income category, **Then** the
   account's balance rises (a credit card's amount owed falls).
3. **Given** a payee with a default category, **When** the user chooses that payee, **Then** the
   category is filled in for them (they may change it).
4. **Given** the user types a payee name that does not exist, **When** they save, **Then** they are
   offered to add it as a new business or person in the same step.
5. **Given** an expense category, **When** the user records money coming back to the account with
   it (a refund), **Then** it reduces that category's spending rather than counting as income.
6. **Given** an amount with more than two decimals, zero, or beyond ₹9,99,99,99,999.99, **When** the
   user saves, **Then** it is refused with an explanation (R2's amount rule).
7. **Given** an archived account, a hidden category or a hidden payee, **When** the user picks for a
   new transaction, **Then** they are not offered (they stay on transactions that already use them).

---

### User Story 2 - Move money between my accounts (Priority: P1)

The user records a transfer — a withdrawal from the bank into cash, a credit-card bill paid from the
bank, money moved between two bank accounts. Both balances change; nothing counts as income or
spending.

**Why this priority**: Card payments and cash withdrawals happen every week; without transfers
balances drift and reports double-count.

**Independent Test**: Asha transfers ₹18,250.00 from Everyday Savings to Rewards Card (paying the
card). Everyday Savings falls by ₹18,250.00, Rewards Card's amount owed falls to ₹0.00, net worth is
unchanged, and this month's spending and income are unchanged.

**Acceptance Scenarios**:

1. **Given** two of the user's active accounts, **When** they record a transfer between them,
   **Then** the "from" balance falls and the "to" balance rises (for a credit card "to", the amount
   owed falls), and Net worth is unchanged.
2. **Given** a transfer, **When** income and spending are totalled, **Then** it is in neither.
3. **Given** the same account as "from" and "to", **When** the user saves, **Then** it is refused.

---

### User Story 3 - Lend, borrow, repay and pay on someone's behalf (Priority: P1)

Money moves between the user and a person: lending to a sibling, borrowing from a friend, being
repaid, repaying, paying a bill on someone's behalf, collecting rent for someone. Each changes the
person's balance and the account's balance, and none counts as the user's own spending or income.

**Why this priority**: The person ledgers (R3) only become useful when money moves through them; the
owner tracks this monthly today and the payment plan (R7) and statements (R6) need it.

**Independent Test**: Ravi Kumar starts at "owes you ₹15,000.00". Asha records: lent Ravi ₹5,000.00
from Cash (Ravi now owes ₹20,000.00); Ravi repaid ₹8,000.00 into Everyday Savings (owes ₹12,000.00);
Asha paid Ravi's ₹2,500.00 electricity bill on his behalf from Everyday Savings (owes ₹14,500.00).
Asha's spending this month is unchanged.

**Acceptance Scenarios**:

1. **Given** a person, **When** the user records **Lent to** (money out of an account) or **Paid on
   behalf of** (money out), **Then** what they owe the user rises by the amount (or what the user
   owes them falls).
2. **Given** a person, **When** the user records **Borrowed from** or **Collected on behalf of** (money
   into an account), **Then** what the user owes them rises (or what they owe the user falls).
3. **Given** a person, **When** the user records **Repaid to** (money out) or **Received back from**
   (money in), **Then** the balance moves towards settled by the amount; a payment larger than the
   balance flips its direction ("owes you" ↔ "you owe"), shown in words.
4. **Given** any of these, **When** income and spending are totalled, **Then** none of them counts.
5. **Given** a restaurant bill of ₹3,000.00 where ₹2,000.00 was a friend's share, **When** the user
   splits it into ₹1,000.00 Eating out and ₹2,000.00 "paid on behalf of" the friend, **Then** only
   ₹1,000.00 counts as spending and the friend owes ₹2,000.00 more.
6. **Given** a person, **When** the user records an **Adjustment** (no account — e.g. a debt forgiven
   or a correction) with a reason, **Then** only the person's balance changes.

---

### User Story 4 - Interest on money lent to or borrowed from people (Priority: P2)

For some people the user charges or pays interest. Each person can have a monthly interest rate with
a history ("1.5% per month from 01-Apr-2026"). At the end of each month the app adds that month's
interest to the person's balance — the month's rate × the balance at the start of the month — and the
user can change or remove that entry, or record interest by hand instead.

**Why this priority**: Replaces the owner's per-person interest spreadsheet, but only some people
carry interest.

**Independent Test**: Ravi owes ₹1,00,000.00 on 01-Oct-2026 with a rate of 1% per month from
01-Apr-2026. When October ends, an interest entry of ₹1,000.00 appears, dated 31-Oct-2026, and Ravi
owes ₹1,01,000.00; November's interest is ₹1,010.00 (it compounds). Movements during October do not
change October's interest.

**Acceptance Scenarios**:

1. **Given** a person, **When** the user sets a monthly rate (any value including 0%) effective from
   the 1st of a month, **Then** it is added to the person's rate history; a rate from a date that is
   not the 1st is refused.
2. **Given** a person with a rate and a balance at the start of a completed month, **When** that month
   ends, **Then** one interest entry for the month exists, dated the last day of the month, equal to
   rate × opening balance rounded to the paisa (half away from zero), in the direction of the balance.
3. **Given** an automatic interest entry, **When** the user edits its amount or deletes it, **Then**
   their change stands and is not recreated; later months use the resulting balances.
4. **Given** a rate change, **When** it is saved, **Then** interest for months already ended is never
   recalculated.
5. **Given** a person set to manual interest, **When** months end, **Then** no automatic entries are
   created; the user records interest entries by hand.

---

### User Story 5 - Split a transaction (Priority: P2)

One payment covers several categories — a supermarket bill with groceries and household items, a
salary credit with salary and a bonus. The user splits it into lines that add up exactly to the
total.

**Why this priority**: Needed for accurate category reports, but most transactions have one category.

**Independent Test**: Asha splits a ₹4,500.00 Fresh Mart bill into Groceries ₹3,200.00, Household
items ₹1,050.00 and Personal care ₹250.00. Each category's spending shows its part; the account falls
by ₹4,500.00.

**Acceptance Scenarios**:

1. **Given** a transaction, **When** the user splits it into two or more lines with a category (or a
   person action, US3) and amount each, **Then** it can be saved only when the lines add up exactly to
   the total; the form shows the amount still to allocate.
2. **Given** a split, **When** reports and totals are computed, **Then** each line counts under its own
   category; tags and notes may be set per line.

---

### User Story 6 - Find, filter and fix many transactions at once (Priority: P2)

The user finds transactions by searching text and filtering by date range, account, category
(including its sub-categories), payee, tag, type, status and amount; selects several and changes
them together; and moves everything from one category or payee to another (relocate).

**Why this priority**: Keeps months of history usable and correctable; needed before real data, not
for the first entry.

**Independent Test**: Asha filters "Food & groceries" (with sub-categories) in October and sees 14
transactions totalling ₹18,420.00; selects 5 and sets the tag "Diwali 2026"; then relocates every
transaction from payee "FreshMart" to "Fresh Mart".

**Acceptance Scenarios**:

1. **Given** the transactions list, **When** the user types text, **Then** it matches payee names,
   notes, reference numbers and category names, and the list shows the count and total of what
   matches.
2. **Given** filters, **When** they are combined, **Then** only transactions matching all are shown; a
   category filter includes its sub-categories.
3. **Given** selected transactions, **When** the user sets a category, payee, status, or adds or
   removes tags, **Then** all selected transactions change in one step and each change is in the
   history.
4. **Given** two categories (or two payees), **When** the user relocates from one to the other,
   **Then** every transaction (and split line) using the first now uses the second; the first remains.
5. **Given** selected transactions, **When** the user deletes them and confirms, **Then** they leave
   every screen and every balance; they remain in the history.

---

### User Story 7 - Statuses and corrections (Priority: P3)

The user marks transactions Cleared when they appear on a statement, flags ones to check later
(Follow-up), voids a mistaken one without deleting it, edits any field, and sees that a transaction
was edited.

**Why this priority**: Prepares for reconciliation (Phase 2a) and keeps mistakes visible; the app is
usable without it.

**Acceptance Scenarios**:

1. **Given** a transaction, **When** the user sets its status to Uncleared, Cleared, Follow-up or
   Void, **Then** it is shown; Void transactions stay listed (struck through) but count in no balance
   or total.
2. **Given** any edit, **When** it is saved, **Then** balances and totals update at once and the
   history records who, when, which device and the values before and after.

---

### User Story 8 - Record transactions offline on Android (Priority: P3, Android phase)

On the Android app the user records and edits transactions with no signal; they sync automatically
when back online, as accounts do in R2.

**Acceptance Scenarios**:

1. **Given** the phone is offline, **When** the user adds or edits a transaction, **Then** it is saved
   on the phone at once, balances on the phone update, and it is sent exactly once when online.
2. **Given** the same transaction was edited on two devices, **When** both have synced, **Then** the
   R2 rule applies per field, and overwritten values stay in the history.

---

### Edge Cases

- A transaction dated before its account's opening-balance date is refused, explaining that the
  opening balance already includes everything before that date (the user can move the opening date
  earlier).
- A transaction dated in the future is refused (see Assumptions).
- An amount of ₹0.00 is refused; amounts are entered positive and the type decides the direction.
- Deleting or archiving an account, category or payee that transactions use follows R2/R3: delete is
  refused (archive, hide or merge instead); merging repoints the transactions.
- Archiving an account with a non-zero balance stays refused (R2); an archived account whose balance
  changes because an older transaction was edited is flagged "archived with a balance" (R2 FR-022).
- Changing a person to a business is refused while they have person movements or a balance (R3).
- A split line's category must be of the same kind as the transaction (expense lines in an expense;
  income lines in income); person lines may appear in either.
- A transfer cannot involve a person; a person movement cannot be a transfer.
- Interest is never accrued for months before the person's first rate, for a 0% rate, or on a zero
  opening balance; amounts round to the paisa.
- Two devices editing the same transaction: per-field latest edit wins (R2); split lines are replaced
  together, so a split edited on two devices ends as one of the two versions, never a mix that
  doesn't add up.
- Hide-balances masks every amount on transaction screens.
- Erasing a user removes all their transactions and history.

## Requirements *(mandatory)*

### Functional Requirements

**Recording**

- **FR-001**: Users MUST be able to record transactions of these types: **Expense** (money out),
  **Income** (money in), **Refund** (money in against an expense category), **Transfer** (between two
  of their accounts), and person movements (US3).
- **FR-002**: Every transaction MUST have a calendar date (not in the future in the user's timezone,
  not before its account's opening-balance date), an account (two for transfers), and an amount
  entered as a positive exact amount with at most two decimals, at most ₹9,99,99,99,999.99, never
  rounded. An optional time of day MAY be recorded and is used only to order transactions within a
  day.
- **FR-003**: Expense, Income and Refund transactions MUST have a category of the matching kind
  (expense for Expense and Refund, income for Income) or be split (FR-012); a payee is optional.
- **FR-004**: Transactions MAY have tags (any number), notes (up to 1,000 characters) and a reference
  number (up to 40 characters).
- **FR-005**: Choosing a payee MUST fill in its default category when the category is still empty.
  Typing a payee name that does not exist MUST offer to create it (business or person) as part of
  saving.
- **FR-006**: Only active accounts, unhidden categories and unhidden payees MUST be offered for new
  entries; existing transactions keep what they use.

**Balances and totals**

- **FR-007**: An account's balance MUST equal its opening balance plus the effect of every
  non-void transaction on it dated on or after the opening-balance date: money out lowers a held
  balance and raises a credit card's amount owed; money in does the opposite. Balances are never
  stored and MUST be recomputable on demand (R2 FR-012/FR-013).
- **FR-008**: A person's balance MUST equal their opening balance plus every non-void person
  movement (US3, US4) dated on or after their opening date (R3 FR-017).
- **FR-009**: Spending and income totals MUST include Expense, Income and Refund lines (Refunds
  reduce spending) and MUST exclude transfers, person movements and interest entries.

**Transfers**

- **FR-010**: A transfer MUST move the same amount from one of the user's accounts to a different one
  of their accounts, and MUST NOT change Net worth.

**People**

- **FR-011**: Person movements MUST be: **Lent to**, **Repaid to**, **Paid on behalf of** (money out of
  an account; raise what the person owes the user), **Borrowed from**, **Received back from**,
  **Collected on behalf of** (money into an account; raise what the user owes the person), and
  **Adjustment** (no account; either direction; a reason is required). Each is labelled in plain
  words wherever it is shown; none counts as the user's spending or income.

**Splits**

- **FR-012**: A transaction MAY be split into 2–50 lines, each with an amount and either a category
  (of the transaction's kind) or a person action (paid on behalf of / collected on behalf of,
  matching the money's direction), and optional notes and tags. The lines MUST add up exactly to the
  transaction amount; the form MUST show the amount left to allocate.

**Interest on person loans**

- **FR-013**: Each person MAY have an interest setting: none (default), automatic or manual, and a
  rate history of monthly rates (any value from 0% to 10% per month, up to four decimal places),
  each effective from the 1st of a month.
- **FR-014**: For automatic interest, after each month ends the app MUST create one interest entry
  for that month, dated its last day, equal to that month's rate × the person's balance at the start
  of the month, rounded to the nearest paisa (half away from zero), in the balance's direction.
  Entries are created at most once per person per month; an entry the user edited or deleted is never
  recreated or recalculated, and later months use the balances as they stand.
- **FR-015**: Users MUST be able to record interest entries by hand for any person.
- **FR-016**: Interest entries MUST be shown as interest wherever person movements are shown, and
  MUST NOT count as the user's spending or income.

**Finding and changing**

- **FR-017**: The transactions list MUST show transactions newest first (by date, then time, then
  entry order), with the account, payee, category or "Split", amount with its direction, tags and
  status, and MUST offer: text search over payee names, notes, reference numbers and category names;
  filters by date range, account, category (including sub-categories), payee, tag, type, status and
  amount range; and the count and net total of what matches.
- **FR-018**: Users MUST be able to select transactions and, in one action, set the category, payee
  or status, add or remove tags, or delete them (with confirmation).
- **FR-019**: Users MUST be able to **relocate** every transaction and split line from one category
  to another of the same kind, or from one payee to another of the same kind, keeping the source
  (R3 FR-026). Category and payee **merge** (R3) MUST also move transactions.
- **FR-020**: Users MUST be able to edit any field of a transaction and delete it (soft delete, with
  confirmation). Statuses MUST be Uncleared (default), Cleared, Follow-up and Void; Void
  transactions count in no balance or total. (Reconciled arrives with reconciliation, Phase 2a.)

**Effects on earlier modules**

- **FR-021**: An account, category or payee that any transaction has ever used MUST NOT be
  deletable (R2 FR-024, R3 FR-025); deleting a tag removes it from its transactions (R3 FR-010) and
  the confirmation states how many.

**Privacy, history, offline**

- **FR-022**: Transactions, split lines, interest settings and rate history MUST be visible to and
  changeable by their owner only (R1 isolation); every create, edit and delete MUST be in the
  append-only history with who, when, device type and before/after values; logs MUST NOT contain
  amounts, notes, payees or categories; erasing a user removes them.
- **FR-023** (Android phase): Transactions MUST be creatable and editable offline with R2's sync
  guarantees; a transaction's split lines change together as one unit.
- **FR-024**: Every amount on transaction screens MUST respect hide-balances (R1).

### Key Entities

- **Transaction**: date, optional time, type, account (and to-account for transfers), amount,
  payee (optional), category or split lines, person action and person (for person movements), tags,
  notes, reference number, status, state (active / deleted), owner.
- **Split line**: amount, category or person action + person, notes, tags; belongs to one transaction.
- **Interest setting** (per person): mode (none / automatic / manual) and **rate history** entries
  (monthly rate, effective month).
- **Interest entry**: a person movement of type interest for a month, automatic or manual; whether the
  user changed it.
- **Change record**: as in R2/R3.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user records a typical expense (payee with a default category) in under 20 seconds,
  and a transfer in under 20 seconds.
- **SC-002**: Across a test set covering every transaction type, splits, refunds, voids, person
  movements that flip direction, interest compounding over 12 months and maximum amounts, 100% of
  account balances, person balances, net worth and spending/income totals match hand-computed values
  to the paisa.
- **SC-003**: With 20,000 transactions, the transactions list opens within 2 seconds and any search or
  filter shows results within 1 second.
- **SC-004**: Automated isolation tests show 0 cases of one user (including the owner-admin) reading
  or changing another user's transactions, interest settings or their history.
- **SC-005**: 100% of changes made during acceptance testing appear in the history with correct
  before/after values; none appears in logs with amounts, notes or names.
- **SC-006**: With hide-balances on, 0 unmasked amounts on any transaction screen.
- **SC-007**: Interest for 24 consecutive months is created exactly once per month per person, even
  when several devices or sessions are open at month end.
- **SC-008** (Android phase): 50 transaction changes made offline across two devices sync with 0 lost
  or duplicated transactions and identical balances on both devices within 1 minute.

## Assumptions

- **Delivery order**: web first (owner, 2026-10-24). Stories 1–7 are built for the web here; Story 8
  and the Android screens come in the Android phase on R2's sync engine.
- **One currency**: every transaction uses the base currency (R2 FR-007); multi-currency is out of
  scope.
- **Future dates** are refused; planned and recurring entries come with the payment plan (R7) and
  scheduled transactions (Phase 2b).
- **Navigation**: the existing Transactions entry (an R1 placeholder) becomes the transactions screen;
  each account and person page lists its own transactions.
- **Attachments, warranty flag** (R9), **quick-add templates** (R8), **custom fields** and
  **reimbursement tracking** (Phase 2b), **reconciliation** and the Reconciled status (Phase 2a),
  **person statements** (R6) and **undo** (Phase 4) are out of scope.
- **Interest timing**: automatic entries for a month are created the first time the user (or a sync)
  is active after the month ends, so they exist before any screen shows that month's balances.
- **Demo data** (constitution X): this module extends the deterministic demo set with about two
  years of transactions for the demo accounts, categories and people, including splits, transfers,
  every person action and interest; R5 loads it.
- Examples use synthetic names and amounts only.
