# Research: Quick-add Templates (R8)

Decisions for [plan.md](plan.md). Spec: [spec.md](spec.md) (clarified 2026-11-14, Q1–Q4).

## R8-01 Templates: one synced table shaped like a transaction

**Decision**: `public.transaction_templates` (synced, R2 conventions). Its fields mirror the R4
transaction fields a template keeps: `kind`, `flow`, `account_id`, `to_account_id`, `amount_minor`
(nullable), `payee_id`, `person_action`, `category_id`, `lines` (jsonb, R4 shape), `tag_ids`, `notes`;
plus `name`, `sort_key`, `hidden`, `plan_item_id` and `state`. Amount and split lines share one field
version, as in R4 (R4-01). Kinds: expense, income, refund, transfer, person (not `adjustment`); interest
is never a template.

**Rationale**: the same shape lets the R4 validation rules be reused almost as they are, and a
recording is built by copying fields, never by translating them.

**Alternatives**: store a template as a jsonb copy of a transaction draft (no per-field merge, no
foreign keys, merges cannot reach it); make templates transactions with a flag (they would appear in
lists, totals and reports).

## R8-02 Order: fractional order keys

**Decision**: `sort_key` with R2's order keys (`keyBetween`, `ORDER_KEY_PATTERN`). Moving a template
up, down or to the top writes one key on one row; two devices reordering resolve per row, latest wins.
List order = `sort_key`, then name.

**Alternatives**: an integer position (moving one rewrites many rows); an order array in preferences
(one field: two devices reordering overwrite each other).

## R8-03 Recording is an ordinary transaction

**Decision**: core `recordFromTemplate(template, { amountMinor, today, plan })` returns
`TransactionCreateFields` (date = today, status uncleared, confirmed), which the client pushes as an
ordinary R4 `create` with a fresh id. The transaction keeps no template id (spec: later edits never
change recordings; FR-006). The R4 applier validates it as any transaction, so a recording can do
nothing a typed transaction could not.

The amount comes from the amount box (clarify Q4): the template's usual amount unless the user typed
another; empty is refused on the client. A split template's amount cannot change from the list (the
lines must add up): a different amount opens the form.

## R8-04 Tied planned payment (clarify Q1)

**Decision**: `plan_item_id` on the template (nullable, composite FK to the user's plan items). It may be
set only to a live item whose kind fits the template — the R7 rule `paysTarget`: an expense to the item's
payee for a payee item, a transfer into the item's card for a card bill, a person movement out to the
item's person for a person item (`INVALID_TEMPLATE` otherwise).

At Record, core `tiedPlanMonth(template, item, view)` picks the month to pay from the current month's
plan view: the oldest carried-over row of that item with something left, else this month's row when
something is left, else none. The client sends `planItemId` / `planMonth` with the create, so the R7
link rules (INVALID_PLAN_LINK) still apply on the server. When there is no month, or the item is ended,
deleted or no longer fits, the transaction is recorded without a link and the message says why.

"Edit first" on a tied template opens the form as Pay does: "Pays: <item> (<month>)" ticked.

## R8-05 References that went away

**Decision**: core `templateProblems(template, live)` lists what is missing (account or to-account
archived or deleted; payee, person, category or a tag deleted). Record with any problem opens the form
filled in, with those fields empty and a message (FR-011). A hidden payee or category is still usable.

## R8-06 Undo and the repeat check (clarify Q2)

**Decision**: client-side. After a recording the screen keeps its transaction id for 10 seconds and offers
Undo, which pushes an R4 `delete`. The same template selected again within 10 seconds asks "Record it
again?". The 10 seconds is kept per page in memory (no storage needed: a reload ends the window).

## R8-07 Merges, deletes, erasure

**Decision**: R4's `_repoint_payee`, `_repoint_category` and `_repoint_tag` also update templates
(`payee_id`, `category_id`, line categories and people, `tag_ids` and line tags), bumping their field
versions. Reset, demo-load emptiness and erasure include the table. Audit family `template`.

## R8-08 Limits and names

**Decision**: at most 100 live templates per user (`LIMIT_REACHED`); names 1–40 characters, unique among
live templates ignoring case (`NAME_TAKEN`; "Save as template" suggests a free name such as "Fresh Mart
(2)").

## R8-09 Reading

**Decision**: repository `listTemplates` reads with the user's client under RLS (select-own), ordered by
`sort_key`. No new SECURITY DEFINER reader. The quick-add list, the Dashboard strip and the form's
"Start from a template" share one client component.
