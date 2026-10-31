# Contract: Database (R6)

Both readers: SECURITY DEFINER (postings are private), `set search_path = ''`, `auth.uid()` only,
refuse inactive users (`USER_INACTIVE`), `p_from <= p_to`, range at most 10 years (`VALIDATION_FAILED`).

| Function | Behaviour |
|----------|-----------|
| `app.category_payee_totals(p_from date, p_to date) → jsonb [ { kind, categoryId, payeeId, totalMinor } ]` | Sum of the caller's counted category postings with `date` in range, grouped by kind, category (null = Uncategorised) and the transaction's payee (null = none); zero sums left out |
| `app.month_totals(p_from date, p_to date) → jsonb [ { month, incomeMinor, spendingMinor } ]` | Per calendar month in range, income and spending (refunds reduce spending) from counted category postings |
| `app.search_transactions` (extended) | Filters `categoryExact: true` (no sub-categories) and `payeeId: "none"` |
| `app._apply_payee` (extended) | Accepts `statementSign` on create and update |

## Rules to prove

1. Readers return only the caller's rows; another user's postings never appear.
2. Totals follow R4's counting rules and equal core `categoryTotals` for the same transactions (parity).
3. A payee level's search returns exactly the transactions behind that total.
