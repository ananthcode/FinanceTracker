# Data Model: Monthly Payment Plan (R7)

Builds on R2 ([accounts](../002-accounts-balances/data-model.md)), R3
([lists](../003-categories-tags-payees/data-model.md)) and R4
([transactions](../004-transactions/data-model.md)). Synced tables follow R2's conventions:
- client UUIDs, and `user_id` from `auth.uid()`;
- `field_versions` and `server_seq`;
- SELECT-only grants, with RLS select-own for an active user;
- `sync.stamp_row` and `audit.capture_record_change`;
- soft delete through `state`.

Money is `bigint` paise; months are `date` values on the 1st (`yyyy-MM-01`), and decisions are in
[research.md](research.md).

## Enums

| Enum | Values |
|------|--------|
| `public.plan_frequency` | `monthly`, `every_n_months`, `yearly`, `one_off` |
| `public.plan_target` | `payee`, `card`, `person` |
| `public.audit_action` (added) | `plan_item_created`, `plan_item_edited`, `plan_item_deleted`, `plan_month_edited` |
| `audit_events.target_type` (added) | `plan_item`, `plan_occurrence` |

## Entity: Plan item — `public.plan_items` (synced)

| Field | Type | Rules |
|-------|------|-------|
| `name` | `text` not null | 1–60 chars, trimmed |
| `target` | `plan_target` not null | Create-only |
| `payee_id` | `uuid` null | `target = payee`: a business payee of the user; `target = person`: a person payee. Composite FK to payees |
| `category_id` | `uuid` null | `target = payee` only; an expense-kind category of the user |
| `card_account_id` | `uuid` null | `target = card` only; the user's credit-card account. Composite FK to accounts |
| `person_action` | `person_action` null | `target = person` only; one of `lent`, `repaid_to`, `paid_on_behalf` |
| `frequency` | `plan_frequency` not null | |
| `interval_months` | `smallint` not null | 1 for monthly, 2–12 for `every_n_months`, 12 for yearly, 0 for one-off (derived and checked) |
| `start_month` | `date` not null | Day 1. Form default: the current month |
| `end_month` | `date` null | Day 1, ≥ `start_month`; null = no end; one-off: equals `start_month` |
| `amount_varies` | `boolean` not null default false | Enables estimates (R7-05) |
| `terms` | `jsonb` not null | 1–120 entries `{ fromMonth, amountMinor \| null, dueDay, accountId }`, sorted by strictly increasing `fromMonth`; first `fromMonth` = `start_month`. `amountMinor` is 1 … 999999999999, and null is allowed only when `target = card` or `amount_varies`. `dueDay` is 1–31. `accountId` is the user's bank, cash, wallet or card account (not the card itself for a card bill). One field version |
| `notes` | `text` null | ≤ 500 chars |
| `state` | `record_state` (`active`, `deleted`) | Soft delete; links are kept (FR-008) |
| `deleted_at` | `timestamptz` null | |

Indexes: `(user_id, state)`. Unique `(id, user_id)` (composite FK target).

**Edits from a month (FR-008)**: an update of `terms` must leave every entry with `fromMonth` before the
user's current month exactly as stored (`TERMS_IN_PAST` otherwise; the current month is that of the
change's HLC time, at most one month before the server's, R7-01). `start_month`, `end_month`,
`frequency` and `interval_months` can change only when no linked month stops applying (`HAS_PAYMENTS`,
R7-03).

## Entity: Item month — `public.plan_occurrences` (synced)

A row exists only when the user set an amount or skipped a month (R7-02).

| Field | Type | Rules |
|-------|------|-------|
| `id` | `uuid` | Must equal `_plan_occurrence_id(item_id, month)` (core `occurrenceId`) |
| `item_id` | `uuid` not null | Composite FK `(item_id, user_id) → plan_items`; create-only |
| `month` | `date` not null | Day 1; create-only; a month the item applies to |
| `amount_minor` | `bigint` null | 0 … 999999999999; null = not set (usual amount or estimate) |
| `skipped` | `boolean` not null default false | |
| `state` | `record_state` | |

Unique `(item_id, month)`. Index `(user_id, month)`.

## Transaction (R4, extended)

| Field | Type | Rules |
|-------|------|-------|
| `plan_item_id` | `uuid` null | Composite FK to the user's plan item |
| `plan_month` | `date` null | Day 1; both null or both set (check) |

Field version `plan` covers both. For a new link, the item must be active and the month must be in its
range. The transaction must be an expense, a transfer, or a person movement with `lent`, `repaid_to`
or `paid_on_behalf` (`INVALID_PLAN_LINK`). Partial index
`(user_id, plan_item_id, plan_month) where plan_item_id is not null`.

## User preferences (R1, extended)

| Field | Type | Rules |
|-------|------|-------|
| `plan_nudge` | `boolean` not null default true | "Remind me to check next month's plan" |
| `plan_checked_month` | `date` null | Day 1; the latest month marked "Plan checked" |

Column grants allow `update (plan_nudge, plan_checked_month)`. A `before update` trigger keeps
`plan_checked_month = greatest(old, new)`, so it only moves forward (R7-09).

## Derived (core, mirrored nowhere else)

| Value | Definition |
|-------|-----------|
| Applies in month | R7-04 |
| Term for month | last `terms` entry with `fromMonth ≤ month` |
| Due date | `min(term.dueDay, last day of month)` |
| Paid | Σ `amount_minor` of linked transactions that are active, confirmed and not void |
| Linked upcoming | Σ of linked active, unconfirmed, non-void transactions |
| Planned | R7-05 (set amount, usual, or estimate) |
| Still to pay | `max(planned − paid, 0)`; overpaid `max(paid − planned, 0)` |
| Status | R7-06 |
| Month totals | planned = paid + still to pay − overpaid (SC-001) |

## State transitions

- Plan item: `active → deleted` (delete). Links stay; months with links still show under the item's
  name marked "removed", and everything else of the item disappears.
- Item month: not stored → stored (set amount or skip) → `amount_minor` null and `skipped` false again
  (reset to usual; the row may stay).
- Transaction link: none → linked (Pay, Link existing, "Pays:") → none (unlink). Delete or void keeps
  the link fields but stops counting.

## Requirement → model traceability

| Requirement | Where |
|-------------|-------|
| FR-001–FR-004 | core `planMonth`; plan screen |
| FR-005, FR-007 | `plan_items` (one-off = `frequency one_off`) |
| FR-006 | `plan_occurrences`; core `plannedFor` |
| FR-008 | `terms`; `TERMS_IN_PAST`; soft delete |
| FR-009 | sync entities `plan_item`, `plan_occurrence` |
| FR-010–FR-013 | `transactions.plan_item_id/plan_month`; core `payDraft`, `likelyMatches`, `paysSuggestions` |
| FR-014–FR-015 | core `planMonth` (carried over, per-account cash) |
| FR-016–FR-017 | core `planMonth` (previous month); R6 people totals |
| FR-018 | core `safeToSpend` (`planUnpaidMinor`) |
| FR-019 | core `demo/plan.ts` |
| FR-020 | transaction screen reads the link |
| FR-023 | `user_preferences.plan_nudge`, `plan_checked_month`; core `nudgeFor` |
