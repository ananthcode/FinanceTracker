# Research: Transactions (R4)

Decisions for the plan. R4 adds the first records that move money; it reuses R2's sync engine and
R3's lists. Each entry: **Decision**, rationale, alternatives.

## R4-01 One synced `transactions` row per transaction; split lines and tags inside it

**Decision**: a transaction is one synced row (`public.transactions`). Its split lines are a `lines`
jsonb array on the row (each line: id, amount, category id *or* person id + person action, notes,
tag ids) and its tags a `tag_ids uuid[]` column. The row is the sync unit; `amountMinor` and `lines`
share one field version (`amount`), so they always win or lose together and a split edited on two
devices never ends half-merged (spec edge case, FR-023).

**Rationale**: R2's per-field rule works on columns; a separate synced lines table would let line
edits from two devices interleave into a split that no longer adds up.

**Alternatives**: a synced `transaction_lines` table — interleaving problem above, plus a second
entity per change; storing lines only in a derived table — the device needs them offline.

## R4-02 Derived `transaction_postings` for balances, totals and filters

**Decision**: a server-only table `app.transaction_postings`, rebuilt by trigger whenever a
transaction row is inserted or updated: one posting per effect — account effect (signed in the
account's convention), person effect (positive = they owe more), category effect (signed: spending
positive for expense lines, refund lines negative; income positive), with date, `counted` (active,
confirmed, not void). Balances (`app.account_balance_minor`, `app.person_balance_minor`), activity
checks, category/payee filters and relocate read postings; nothing reads jsonb in hot paths.

**Rationale**: one place derives every effect, mirrored by one pure function in core
(`postingsOf(transaction)`) run on the same vectors — the R2-07 parity pattern.

**Alternatives**: computing from jsonb at query time — slow filters, duplicated logic.

## R4-03 Types and flow

**Decision**: `kind` ∈ `expense`, `income`, `refund`, `transfer`, `person`, `interest`; `flow` ∈
`out`, `in` (derived and checked: expense/out, income/in, refund/in, transfer/out from `account_id` to
`to_account_id`). Person movements carry `person_action` ∈ `lent`, `repaid_to`, `paid_on_behalf`
(flow out), `borrowed`, `received_back`, `collected_on_behalf` (flow in), `adjustment` (no account;
flow chooses the direction). Interest has no account; its flow follows the person's balance sign.
Person effect = +amount for flow out, −amount for flow in. Account effect for held types = −amount
out / +amount in; for owed types (credit cards) the opposite.

## R4-04 Upcoming and "To confirm" (FR-002a, FR-014)

**Decision**: a `confirmed boolean` field (synced, merged per field). A create dated after today in
the user's timezone is stored `confirmed = false`; moving a transaction to the future sets it false.
Upcoming = unconfirmed and date > today; awaiting confirmation = unconfirmed and date ≤ today.
Postings of unconfirmed transactions are `counted = false`. Confirming is an `update` of `confirmed`
(bulk confirm = several updates in one push). The "To confirm" count is one indexed query run by the
signed-in layout.

## R4-05 Interest: settings, rates, proposals

**Decision**: payees gain `interest_mode` (`none` | `automatic` | `manual`); rates live in a synced
`person_rates` table (person, effective month = 1st of a month, `rate_e4` integer = percent × 10⁴,
0…100000 = 0–10 % a month). `app.propose_interest()` (SECURITY DEFINER, per-user advisory lock),
called when the web app opens a signed-in page, creates for each automatic person and each completed
month since their first rate one `interest` transaction (`generated = true`, `interest_month`,
`confirmed = false`) — unique on (user, person, month) across every state, so a deleted proposal is
never recreated. It then recomputes, in month order, the amount of every still-unconfirmed,
unedited proposal: `round_half_away(opening × rate_e4 / 10⁶)`, where the month's opening balance
includes earlier months' interest whether confirmed or proposed (spec FR-014). Editing the amount
sets `user_edited = true`, which stops recomputation. Core has the same function (`proposeInterest`)
over shared vectors.

**Alternatives**: a nightly pg_cron job — runs with no user context and cannot easily scope to
`auth.uid()`; creating proposals on read only in the UI — duplicates across devices.

## R4-06 Writes and new change kinds

**Decision**: `transaction` and `person_rate` join the sync entities (create, update, delete).
`category` and `payee` gain the change kind `relocate` (`{ targetId }`): every transaction and line
using the source moves to the target, the source stays (FR-019). R3's merge functions now also
repoint transactions, lines and tags (R3 review note). Bulk edit is a push of many `update` changes
(chunked at 100). `apply_changes` validates: accounts active and the caller's; categories of the
right kind; persons are person payees; lines add up; dates not before opening dates; amount range;
transfer accounts differ.

## R4-07 R2/R3 placeholders replaced

**Decision**: `app.account_balance_minor`, `app.account_has_activity`,
`app.person_balance_minor`, `app.category_has_activity`, `app.payee_has_activity`,
`app.tag_usage_count` now read postings / transactions (any state, so "ever used" holds).
Changing an account's opening date to after an existing transaction is refused (clarify Q2).

## R4-08 Reading and searching

**Decision**: `app.search_transactions(p_filters jsonb, p_after jsonb, p_limit int)` (SECURITY INVOKER,
RLS applies): filters per FR-017 (text over payee name, notes, reference, category names; date range;
account; category with sub-categories or "uncategorised"; payee; tag; type; status; amount range),
keyset pagination on (date desc, time desc, created order), page size 50, and the match count and net
total. Indexes on (user_id, date desc), postings (user_id, category_id), GIN on `tag_ids`.

## R4-09 Web UI

**Decision**: `/transactions` (To confirm section, search, filter panel, list with "Load more",
selection and a bulk-action bar), `/transactions/new` (type tabs: Expense, Income, Refund, Transfer,
Person; split editor; payee combobox that can create a payee; tag picker that can create a tag) and
`/transactions/[id]`; account pages and person pages show their own transactions; the person page
gains interest settings and rate history. The R1 Transactions placeholder is replaced; the nav entry
shows the "To confirm" count.

## R4-10 Demo data

**Decision**: `packages/core/src/demo/transactions.ts` generates ~2 years (24 months) of deterministic
transactions for the R2 demo accounts and R3 demo lists — salary, groceries, utilities, card bills
paid by transfer, splits, refunds, every person action, a person with automatic interest and one with
manual interest, a few upcoming and awaiting confirmation. R5 loads it.
