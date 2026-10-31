# Data Model: Transactions (R4)

Builds on R2 ([accounts](../002-accounts-balances/data-model.md)) and R3
([lists](../003-categories-tags-payees/data-model.md)). Synced tables follow R2's conventions
(client UUIDs, `user_id` from `auth.uid()`, `field_versions`, `server_seq`, SELECT-only grants, RLS
select-own + active user, `sync.stamp_row` and `audit.capture_record_change`). Money is `bigint` paise.

## Enums

| Enum | Values |
|------|--------|
| `public.transaction_kind` | `expense`, `income`, `refund`, `transfer`, `person`, `interest` |
| `public.money_flow` | `out`, `in` |
| `public.person_action` | `lent`, `repaid_to`, `paid_on_behalf`, `borrowed`, `received_back`, `collected_on_behalf`, `adjustment` |
| `public.transaction_status` | `uncleared`, `cleared`, `follow_up`, `void` |
| `public.interest_mode` | `none`, `automatic`, `manual` |
| `public.audit_action` (added) | `transaction_created`, `transaction_edited`, `transaction_confirmed`, `transaction_deleted`, `person_rate_created`, `person_rate_edited`, `person_rate_deleted`, `category_relocated`, `payee_relocated` |
| `audit_events.target_type` (added) | `transaction`, `person_rate` |

## Entity: Transaction — `public.transactions` (synced)

| Field | Type | Rules |
|-------|------|-------|
| `date` | `date` not null | Not before the account's (or person's) opening date (clarify Q2) |
| `time_of_day` | `time` null | Ordering within a day only (Principle XII) |
| `kind` | `transaction_kind` not null | Create-only |
| `flow` | `money_flow` not null | Derived and checked per kind (research R4-03) |
| `account_id` | `uuid` null | Composite FK `(account_id, user_id) → accounts`; required except `adjustment` and `interest` |
| `to_account_id` | `uuid` null | Transfers only; ≠ `account_id`; same user |
| `amount_minor` | `bigint` not null | 1 … 999999999999 |
| `payee_id` | `uuid` null | FK to the user's payees; for `person` / `interest` it is the person (kind person) |
| `person_action` | `person_action` null | Required for `person`; must match `flow` |
| `category_id` | `uuid` null | Null = Uncategorised or split; kind must match (expense for expense/refund, income for income) |
| `lines` | `jsonb` not null default `[]` | 0 or 2–50 lines `{ id, amountMinor, categoryId | (personId, personAction), notes, tagIds }`; sum = `amount_minor`; shares the `amount` field version |
| `tag_ids` | `uuid[]` not null default `{}` | The user's tags; GIN index |
| `notes` | `text` null | ≤ 1,000 chars |
| `reference` | `text` null | ≤ 40 chars |
| `status` | `transaction_status` not null default `uncleared` | `void` counts nowhere |
| `confirmed` | `boolean` not null | False for upcoming / awaiting confirmation (FR-002a) and interest proposals (FR-014) |
| `generated` | `boolean` not null default false | Automatic interest proposal |
| `interest_month` | `date` null | 1st of the month; generated interest only. Unique `(user_id, payee_id, interest_month) where generated` — all states, so deleted proposals are never recreated |
| `user_edited` | `boolean` not null default false | A proposal whose amount the user changed: no more recomputation |
| `state` | `record_state` (`active`, `deleted`) | Soft delete |
| `deleted_at` | `timestamptz` null | |

**Counted** (in balances and totals) = `state = active` and `confirmed` and `status <> void`.

## Entity: Posting — `app.transaction_postings` (derived, server only)

One row per effect, rebuilt by trigger from each transaction row (research R4-02):

| Field | Meaning |
|-------|---------|
| `transaction_id`, `line_no` | Source |
| `user_id`, `date`, `counted` | As the transaction |
| `account_id`, `account_effect` | Signed in the account's convention (held: in +, out −; owed: out +, in −) |
| `person_id`, `person_effect` | Positive = the person owes the user more |
| `category_id`, `category_effect` | Expense lines +, refund lines −, income lines +; `null` category = Uncategorised |
| `category_kind` | expense / income (for totals) |

Indexes: `(user_id, account_id)`, `(user_id, person_id)`, `(user_id, category_id, date)`.

## Entity: Person rate — `public.person_rates` (synced)

| Field | Type | Rules |
|-------|------|-------|
| `payee_id` | `uuid` not null | The user's person payee |
| `effective_month` | `date` not null | Day 1 only; unique per person among non-deleted |
| `rate_e4` | `integer` not null | 0 … 100000 (0–10 % a month, 4 decimals) |
| `state` | `record_state` (`active`, `deleted`) | |

## Payee (R3, extended)

| Field | Type | Rules |
|-------|------|-------|
| `interest_mode` | `interest_mode` not null default `none` | People only (businesses: `none`) |

## Derived

- Account balance = opening + Σ counted account effects on/after the opening date
  (`app.account_balance_minor`, core `currentBalance` with `movementsOf`).
- Person balance = opening + Σ counted person effects (`app.person_balance_minor`, core).
- Spending = Σ counted expense-kind category effects; income = Σ income-kind effects; transfers,
  person and interest effects are not category effects.
- Interest proposal for month M = `round_half_away(opening(M) × rate_e4(M) / 1 000 000)`, opening(M)
  including earlier interest whether confirmed or proposed.

## Requirement → model traceability

| Requirement | Where |
|-------------|-------|
| FR-001–FR-006, FR-002a | `transactions` columns and checks; `apply_changes` validation |
| FR-007–FR-010 | postings; balance functions; core `postingsOf`, `movementsOf` |
| FR-011 | `kind = person`, `person_action`, `flow` |
| FR-012 | `lines` + shared `amount` version |
| FR-013–FR-016 | `payees.interest_mode`, `person_rates`, `app.propose_interest`, core `proposeInterest` |
| FR-017 | `app.search_transactions` |
| FR-018–FR-019 | bulk updates; `relocate` change kind; merges repoint |
| FR-020–FR-021 | `status`, soft delete; activity functions read transactions |
| FR-022–FR-024 | RLS, audit, erasure; R2 sync; `<Money>` |
