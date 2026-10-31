# Contract: Sync protocol additions (R4)

Extends [R2](../../002-accounts-balances/contracts/sync-protocol.md) and
[R3](../../003-categories-tags-payees/contracts/sync-protocol.md).

## Entities and kinds

| Entity | Kinds |
|--------|-------|
| `transaction` | `create`, `update`, `delete` |
| `person_rate` | `create`, `update`, `delete` |
| `category`, `payee` (R3, extended) | + `relocate` with `{ "targetId": "uuid" }` |

## Transaction fields (camelCase)

`date`, `timeOfDay`, `kind` (create only), `accountId`, `toAccountId`, `amountMinor` (decimal string),
`payeeId`, `personAction`, `flow` (adjustment / interest only — derived otherwise), `categoryId`,
`lines` (array of `{ id, amountMinor, categoryId? , personId?, personAction?, notes?, tagIds? }`),
`tagIds`, `notes`, `reference`, `status`, `confirmed`.

- `amountMinor` and `lines` share one field version: a change carrying either carries both, and they
  win or lose together.
- Server-controlled: `generated`, `interestMonth`, `userEdited` (set when an update changes a
  generated entry's amount), `state`, timestamps, versions.
- A create dated after today in the user's timezone is stored `confirmed: false` whatever was sent.

## Person rate fields

`payeeId` (create only), `effectiveMonth` (`yyyy-MM-01`), `rateE4` (integer 0–100000).

## New rejection codes

`DATE_BEFORE_OPENING` (transaction before an account's or person's opening date; opening date moved
after a transaction), `LINES_MISMATCH` (lines do not add up), `ACCOUNT_INACTIVE` (archived or deleted
account for a new transaction), `INVALID_PERSON` (person action on a business), `INVALID_CATEGORY`
(category of the wrong kind or deleted). Reused: `VALIDATION_FAILED`, `NOT_FOUND`, `DATE_IN_FUTURE`
(rates only).

## Pull

`rows` gains `transaction` and `person_rate`.
