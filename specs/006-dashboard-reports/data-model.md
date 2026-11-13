# Data Model: Dashboard, Reports & Statements (R6)

## New fields

| Table.column | Type | Rules |
|--------------|------|-------|
| `user_preferences.buffer_minor` | bigint not null default 0 | ≥ 0 and ≤ 999,999,999,999; API `bufferMinor` (decimal string) |
| `payees.statement_sign` | enum `statement_sign` (`they_owe_positive`, `i_owe_positive`) not null default `they_owe_positive` | synced field `statementSign`; meaningful for people only (businesses keep the default) |

## Readers (not stored)

| Name | Rows |
|------|------|
| `category_payee_totals(from, to)` | `{ kind: expense|income, categoryId|null, payeeId|null, totalMinor (text) }` |
| `month_totals(from, to)` | `{ month: yyyy-MM-01, incomeMinor, spendingMinor }` (text) |

## Core shapes

As built (packages/core `reports` and `statements`):

- **ReportNode**: `{ id|"uncategorised", name, ownMinor, totalMinor, children: ReportNode[], payees:
  { id|"none", totalMinor }[] }` — `totalMinor` = own + children; payees add up to own. A **ReportTree**
  holds `{ kind, totalMinor, nodes, byId }`. Payee names are looked up by the screen.
- **TrendMonth**: `{ month, incomeMinor, spendingMinor, netMinor }`, every month of the period.
- **SafeToSpend**: `{ heldMinor, cardOwedMinor, upcomingMinor, bufferMinor, resultMinor, shortfallMinor }`.
- **PersonStatement**: `{ from, to, sign, openingMinor, rows: { transactionId, date, label, notes,
  amountMinor, balanceMinor }[], closingMinor, realClosingMinor }` — amounts as displayed under the
  sign; `realClosingMinor` (positive = they owe the user) gives the closing words.
- **StatementDocument**: the text a shared file shows — title, source (display name), range, what
  positive means, opening, rows (notes only when included), "no movements" line, closing in words.
