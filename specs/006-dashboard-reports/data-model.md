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

- **CategoryNode**: `{ id|"uncategorised", name, ownMinor, totalMinor, children: CategoryNode[], payees:
  { id|"none", name, totalMinor }[] }` — `totalMinor` = own + children; payees add up to own.
- **SafeToSpend**: `{ heldMinor, cardOwedMinor, upcomingMinor, bufferMinor, resultMinor, shortfallMinor }`.
- **Statement**: `{ person, from, to, sign, openingMinor, rows: { date, label, notes, amountMinor,
  balanceMinor, transactionId }[], closingMinor }` — amounts as displayed under the sign.
