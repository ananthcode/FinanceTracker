# Contract: Transaction screens (R4)

## Navigation

The R1 Transactions entry becomes the transactions screen and shows a "N to confirm" badge when N > 0.

## Routes

| Route | Purpose |
|-------|---------|
| `/transactions` | "To confirm" section (oldest first; Confirm, Edit, Delete; select several → Confirm all); search box; filter panel (date range, account, category incl. Uncategorised, payee, tag, type, status, amount range); count and net total; list newest first with "Load more"; select rows → bulk bar (category, payee, status, add/remove tags, delete) |
| `/transactions/new` | Type tabs: Expense, Income, Refund, Transfer, Person (action select). Fields per type; payee combobox (create new business/person inline); category picker (kind fixed by type); split editor; tag picker (create inline); notes, reference, status; date (future → "Upcoming" note) and optional time |
| `/transactions/[id]` | Same form for editing; Delete; for a generated interest entry: shows the month and rate, editable amount, Confirm |
| `/accounts/[id]` (R2, extended) | The account's transactions (latest 50, link to the filtered list) |
| `/people/[id]` (R3, extended) | Interest setting (None / Automatic / Manual), rate history (add rate from a month), the person's movements, "Record interest" |
| `/settings/categories`, `/settings/payees` (R3, extended) | Relocate action next to Merge |

## Rules

- Every amount through `<Money>` with its direction in words (spent, received, transferred,
  "lent to Ravi", …); hide-balances masks all.
- Uncategorised transactions show "Uncategorised"; splits show "Split (n)".
- Upcoming transactions show "Upcoming"; awaiting confirmation "To confirm"; Void is struck through.
- The split editor shows "₹X left to allocate" and refuses to save until it is ₹0.00.
- Refusals use plain messages (e.g. "This date is before Everyday Savings' opening balance of
  01-Apr-2026. Change the account's opening date first." with a link).

## Shared primitives (packages/core)

| Primitive | Contract |
|-----------|----------|
| `TransactionCreateFields`, `TransactionUpdateFields`, `PersonRateFields`, `RelocateFields` | Zod schemas |
| `postingsOf(tx, accounts)` | Pure; the TS twin of the postings trigger |
| `movementsOf(transactions, accounts)` | Account movements for `currentBalance` |
| `personMovementsOf(transactions)` | Person movements for `personBalance` |
| `categoryTotals(transactions, categories, range)` | Spending / income per category with roll-up |
| `proposeInterest(person, rates, transactions, today)` | Month-by-month proposals; same vectors as SQL |
| `interestAmount(opening, rateE4)` | Round half away from zero, exact |
| `transactionLabel(tx, names)` | Plain-language description of the movement |
| `demoTransactions()` | Deterministic 24-month demo set |
