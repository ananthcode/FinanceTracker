# Research: Monthly Payment Plan (R7)

Decisions for [plan.md](plan.md). Spec: [spec.md](spec.md) (clarified 2026-11-13, Q1–Q5).

## R7-01 Plan items: one synced row with dated terms

**Decision**: `public.plan_items` (synced, R2 conventions). The parts of an item that can change "from a
month onward" (FR-008, clarify Q5) — usual amount, due day, pay-from account — live in one `terms`
field: a jsonb array of `{ fromMonth, amountMinor, dueDay, accountId }` sorted by `fromMonth`, the
first entry's `fromMonth` equal to `start_month`. An edit from month M keeps entries before M, drops
entries from M on, and appends one entry from M. The array has one field version (like R4's
`amount` + `lines`): two offline edits of the terms resolve latest-wins as a whole, and the losing
edit stays in the audit history (Principle IV).

The month an edit applies from is chosen in the form (default: the month being viewed) and is
refused when earlier than the user's current month (`TERMS_IN_PAST`). "Current month" is the month of
the change's own time (its HLC wall clock, in the user's timezone), but never more than one month
before the server's current month. An edit made offline on the 31st and synced after midnight is
therefore still accepted, and an old clock cannot rewrite older history.

**Rationale**: one row per item keeps identity stable for comparisons and links; the terms list is
small (one entry per edit) and fully reproduces what any month showed.

**Alternatives**: ending the item and creating a new one (breaks "per item last month" comparison and
link history); a separate synced `plan_item_terms` table (more sync surface for no gain); freezing
earlier months as occurrence rows (unbounded writes).

## R7-02 Item months: rows only when the user changes a month

**Decision**: `public.plan_occurrences` (synced) holds only what the user set for one item in one
month: `amount_minor` (null = not set) and `skipped`. Everything else is derived from the item. The row
id is **deterministic**: core `occurrenceId(itemId, month)` = the item's UUID with its first 32 bits
XOR-ed with `year × 12 + monthIndex`. Two offline devices setting the same item-month therefore write
the same row; the R2 appliers already treat a `create` for an existing id as an update, so the fields
merge per field. The database checks the id equals the derivation (`_plan_occurrence_id`) and keeps
`unique (item_id, month)`.

**Rationale**: avoids duplicate rows for one item-month across devices without a server round trip;
the derivation is a few lines in TypeScript and SQL (tested for parity).

**Alternatives**: random ids with server-side natural-key merge (devices end up with orphan local
rows); per-month overrides as jsonb on the item (concurrent edits of different months would
overwrite each other under one field version).

## R7-03 Payment links: two fields on the transaction

**Decision**: `transactions.plan_item_id` + `transactions.plan_month` (both null or both set), synced as
`planItemId` / `planMonth` sharing one field version `plan`. A transaction therefore pays at most one
item-month by construction (FR-011); an item-month can have many. Linking, unlinking and "Pays:" in
the add form are ordinary transaction creates/updates. Paid = Σ `amount_minor` of linked transactions
that are **counted** (active, confirmed, not void — R4); deleting or voiding one drops it from paid
automatically (FR-012) and unlinking leaves the transaction otherwise unchanged.

Rules checked by `_apply_transaction` when a link is set (`INVALID_PLAN_LINK` otherwise): the item is
the caller's and not deleted; `planMonth` is a 1st of a month within the item's active range; the
transaction is an expense, a transfer, or a person movement out (`lent`, `repaid_to`,
`paid_on_behalf`). Existing links survive the item's later deletion (FR-008: paid months stay).
Composite FK `(plan_item_id, user_id) → plan_items(id, user_id)`.

**Linking an already-linked transaction (US3 3)**: the fields would simply move the link, so the
refusal is a client rule:
- Plan-side linking ("Link existing", "Looks paid — link?") lists only unlinked transactions.
  Search results that are already linked are shown disabled with "Already pays <item> (<month>) —
  unlink it first".
- The `linkTransaction` builder refuses a transaction whose stored link is set.
- Moving a link on purpose stays possible from the transaction's own form ("Pays:"), which shows the
  current link.

The invariant "at most one item-month" holds by construction either way. Two offline devices linking
one transaction resolve latest-wins.

**Months with links stay (FR-008)**: an item update is refused with `HAS_PAYMENTS` when:
- `start_month` moves after a linked month;
- `end_month` moves before a linked month;
- `frequency` or `interval_months` changes so that a linked month no longer applies.

A link can still reach such a month through an offline conflict. `planMonth` therefore always shows
an item-month that has links, even if the item no longer applies there.

A linked transaction that is **not confirmed yet** (upcoming) is not paid; the item-month shows it as
"Upcoming payment linked" and it reduces what safe to spend subtracts for that item (R7-08).

**Alternatives**: a separate link table (needs its own sync entity and a uniqueness rule on the
transaction anyway).

## R7-04 Which months an item applies to; due dates

**Decision**: core `appliesIn(item, month)`: month ≥ `start_month`, ≤ `end_month` when set, and
(months since start) mod interval = 0, where interval = 1 (monthly), N (every N months, 2–12), 12
(yearly); one-off = the start month only. Due date = the term's `dueDay` clamped to the month's last
day (US2 6). The term for a month is the last entry with `fromMonth ≤ month`.

## R7-05 Planned amount and estimates (clarify Q3)

**Decision**: core `plannedFor(itemMonth, ctx)`:
1. The month's set amount (`plan_occurrences.amount_minor`) → not estimated.
2. Item not marked "amount varies" → the term's `amountMinor`.
3. Amount varies (labelled "estimated"):
   - credit-card bill in the current or coming month → the card's amount owed now **plus** what is
     already paid toward this item-month (so paying the bill does not shrink its own plan);
   - otherwise the previous month's paid total for this item, when above zero;
   - otherwise the term's `amountMinor`;
   - otherwise 0, shown as "Amount not set".

**Rationale**: the "plus paid" correction keeps a ₹20,000 card bill at ₹20,000 after an ₹8,000 part
payment (₹12,000 left), matching US3 4.

**As built (2026-11-14)**, two refinements:
- A varying item-month that has a payment (and no amount set) shows **the paid amount** as planned, so
  a ₹1,800 bill paid against a ₹2,000 estimate is Paid rather than ₹200 overdue forever. The card
  estimate (owed + paid) still applies in the current and coming month.
- A varying card bill is **not carried over**: what was left unpaid is already in what the card owes
  now, which the current month's estimate uses, so carrying it would count it twice.
- A removed item's paid month, and a linked month the item no longer has, show planned = paid.

## R7-06 Status, totals and carry-forward

**Decision**: core `planMonth(input)` returns rows and totals for one month (contract
[client-plan.md](contracts/client-plan.md)).
- Status (FR-002) from paid, planned, due date and today (user's timezone): Skipped; Paid (paid ≥
  planned > 0); Part paid (0 < paid < planned, plus Overdue when past due); Due today; Overdue (n days
  late); Due.
- Totals (FR-003): planned = Σ planned of non-skipped rows; paid = Σ paid; still to pay = Σ max(planned
  − paid, 0); overpaid = Σ max(paid − planned, 0); planned = paid + still to pay − overpaid exactly
  (property-tested on vectors).
- Carry-forward (FR-014, SC-005): item-months before the current month that are not skipped and have
  something left are listed in later months' views under "Carried over" with their own month and due
  date. They are **counted only in the current month's totals**; other months show them marked
  "counted in <current month>". Future-month views do not repeat them in totals.

## R7-07 Likely matches and "Pays:" (clarify Q1–Q2)

**Decision**: core `likelyMatches(itemMonth, transactions)` and `paysSuggestions(draft, itemMonths)` —
one rule (FR-013): active, not linked, same target (payee for payee items, `to_account_id` = card for
card bills, person + an out action for person items), amount within ±20 % of what is left, date
within 10 days of the due date or in the item's month. Best match first: smallest amount difference,
then nearest date. Candidates for the plan screen come from one narrow read: unlinked active
transactions dated from 10 days before the earliest unpaid due date shown to 10 days after the month
end, with a payee or card among the items' targets (PostgREST `or=` filter; RLS select-own).

The add-transaction form asks a server action for suggestions when payee/card, amount and date are set
(debounced); the first is ticked by default, others and "None" selectable. Opening the form from
"Pay" fixes the link to that item-month.

## R7-08 Safe to spend (FR-018)

**Decision**: core `safeToSpend` gains `planUnpaidMinor`: for the current month's rows including
carried-over ones, Σ max(stillToPay − linkedUpcoming, 0) for items paid from an account counted in net
worth, **excluding** card-bill items (card owed is already subtracted). `linkedUpcoming` = amounts of
linked, unconfirmed, non-void transactions (already subtracted as upcoming in R6). Result =
held − card owed − upcoming − plan unpaid − buffer, never below 0. The Dashboard card shows the new
part in words ("Still to pay in your plan").

## R7-09 Month check and nudge (FR-023, clarify Q3–Q4)

**Decision**: two preferences on `user_preferences` through the R1 preferences endpoint (as R6's
buffer): `plan_nudge boolean not null default true` and `plan_checked_month date null` (the latest
month the user selected "Plan checked" for; month M is checked when `plan_checked_month ≥ M`).
Core `nudgeFor(today, prefs)` returns the target month (25th–end of month → next month; 1st–5th →
this month) or null (outside the window, nudge off, or checked). "Not now" is stored per client in
`localStorage` (`ft.planNudge.snoozedUntil` = tomorrow's date), wrapped in try/catch; on Android in
the Android phase it uses local storage the same way. The count of estimated amounts comes from
`planMonth` for the target month.

"Plan checked" is offered only for the month the nudge is about: this month from the 1st to the 5th,
otherwise next month. So checking can never skip over an unchecked month. The stored month only moves
forward. A `before update` trigger on `user_preferences` keeps `greatest(old, new)` for
`plan_checked_month`. A column grant alone cannot enforce this. Reset and erasure clear it by
deleting the row or through a definer path that bypasses the trigger.

**Rationale**: preferences already reach both clients and need no new synced entity; a "checked
through" date is enough because only the coming month is ever nudged. Offline marking on Android
queues like other preference writes (Android phase).

**Alternatives**: a synced `plan_month_checks` table (more sync surface for one date); phone
notifications (Phase 2b, out of scope).

## R7-10 Pay pre-fill

**Decision**: "Pay" opens `/transactions/new?plan=<itemId>&month=<yyyy-MM>`; the page builds the draft
with core `payDraft(itemMonth, item, today)`:
- payee item → expense, payee, category, amount left, today, pay-from account;
- card bill → transfer from the pay-from account to the card;
- person item → person movement with the item's action.

Notes = the item's name and month. If the pay-from account is archived or deleted, the account is left
empty and the form asks for one. If the payee, category or person was deleted, that field is empty
(edge cases). Saving sends one create carrying `planItemId`/`planMonth` — one transaction, one link
(SC-002).

## R7-11 Demo plan (FR-019)

**Decision**: core `demo/plan.ts` adds items to the deterministic demo household:
- two EMIs (monthly), rent, two card bills (amount varies), school fees every 3 months, yearly car
  insurance, a monthly repayment to a person and a streaming subscription;
- links from the existing demo transactions for past months (the generator marks the matching
  transactions with `planItemId`/`planMonth`);
- one deliberately unpaid item last month, so the demo shows an overdue carry-forward;
- `plan_checked_month` left empty, so the nudge shows in the window.

Loaded through the R5 loader (`app._load_demo` applies the changes) and cleared by the reset.

## R7-12 Merges, deletes, erasure

**Decision**:
- **Merges:** payee and category merges and relocates (`_repoint_payee`, `_repoint_category`) also
  repoint `plan_items.payee_id` / `category_id` (FR edge case "follows the merge").
- **Deletes:** deleting a payee, category or account leaves the item pointing at the soft-deleted row;
  the screen shows its name and Pay asks for another.
- **Erasure and reset:** both include the two new tables and the new preference columns.
- **Audit:** `audit.capture_record_change` on both new tables, with new audit actions
  `plan_item_created/edited/deleted` and `plan_month_edited`. Link changes are audited as transaction
  edits.

## R7-13 Reading the plan

**Decision**: the web reads with the user's server client (RLS):
- items (all states, for removed items with links);
- occurrences for the shown months;
- linked transactions as narrow columns (`id, plan_item_id, plan_month, amount_minor, date, state,
  confirmed, status`) for all months up to the shown month, so carry-forward is exact;
- R7-07 candidates;
- account balances (R2 summary) and people totals (R6 Dashboard source).

All computation is in core (`planMonth`), so Android reuses it on local data. No SECURITY DEFINER
reader is needed, because transactions, items and occurrences are client-readable under select-own
RLS. Indexes: `transactions (user_id, plan_item_id, plan_month) where plan_item_id is not null`;
`plan_occurrences (user_id, month)`.

**Performance (SC-003)**: 100 items × 24 months gives at most 2,400 occurrences and about 2,400 links:
four small queries and one pure computation, well inside 2 s. A month change re-reads the
occurrences and candidates only.
