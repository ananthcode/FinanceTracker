# Contract: Plan screens and core functions (R7)

## Screens

| Route / place | Shows |
|---------------|-------|
| `/payment-plan?month=yyyy-MM` (default this month) | Month header with ‹ › (earliest item start … 24 months ahead) and the month-check nudge. Totals: planned, paid, still to pay, and overpaid when not zero. A table of items by due date: name, what it pays, from-account, planned (with "estimated" or "Amount not set"), due date, status in words, paid and links, and actions (Pay, Link existing, Set amount, Skip, Edit, End). "Carried over" section. "Looks paid — link?" hints. "Cash by account" for the current month. "Compared with <last month>". "Money owed to / by people". "Plan checked" button. Empty state with "Add a planned payment" (and demo data in the demo environment) |
| `/payment-plan/new`, `/payment-plan/[id]` | Item form: name; what it pays (payee and category / credit card / person and action); amount and "Amount varies"; due day; from account; frequency (Every N months shows N); start month (default the viewed month); end month; notes. On edit: "Apply from" month (default the viewed month, min the current month). Delete with a warning when months have payments |
| `/transactions/new?plan=<id>&month=yyyy-MM` | R4 form pre-filled by `payDraft`; shows "Pays: <item> (<month>)" fixed |
| `/transactions/new` (R4, extended) | "Pays:" choice from `planSuggestions` (first ticked; others; None) |
| `/transactions/[id]` (R4, extended) | "Pays <item> (<month>)" with Unlink; delete and void warn that the item becomes unpaid (FR-020) |
| `/` Dashboard (R6, extended) | Month-check nudge; safe to spend shows "Still to pay in your plan" as a fifth part |
| `/settings` (extended) | "Remind me to check next month's plan" switch |

"Plan checked" appears only on the nudge's month (this month from the 1st to the 5th, otherwise next
month). The link dialog lists unlinked transactions. Already-linked search results are shown disabled
with "Already pays <item> (<month>) — unlink it first".

Every amount goes through `<Money>` (hide-balances). Statuses, "estimated" and directions are words.
Ids for tests: `#plan-month`, `#plan-total-planned`, `#plan-total-paid`, `#plan-total-left`,
`[data-plan-row]` with `data-status`, `#plan-carried`, `#plan-cash`, `#plan-compare`, `#plan-people`,
`#plan-nudge`.

## Core (`packages/core/src/plan/`)

```ts
type Month = string; // "yyyy-MM-01"

occurrenceId(itemId: string, month: Month): string                       // R7-02
appliesIn(item: PlanItem, month: Month): boolean                          // R7-04
termFor(item: PlanItem, month: Month): PlanTerm
dueDate(item: PlanItem, month: Month): string                             // yyyy-MM-dd
editTerms(terms: PlanTerm[], from: Month, change: Partial<PlanTermValues>, currentMonth: Month): PlanTerm[]  // throws TERMS_IN_PAST

plannedFor(input: { item; month; occurrence?; paidMinor; previousPaidMinor; cardOwedMinor?; currentMonth }):
  { plannedMinor: bigint; estimated: boolean; notSet: boolean }          // R7-05

planMonth(input: {
  month: Month; today: string;           // user's timezone
  items: PlanItem[]; occurrences: PlanOccurrence[];
  links: LinkedTransaction[];            // all linked, narrow columns
  candidates: TransactionView[];         // for likely matches
  accounts: { id; type; balanceMinor; creditLimitMinor?; state }[];
}): PlanMonthView
// PlanMonthView = { rows: PlanRow[]; carried: PlanRow[]; totals: { plannedMinor; paidMinor; leftMinor; overpaidMinor };
//   countedHere: boolean; cash: { accountId; leftMinor; availableMinor; shortMinor }[];
//   previous: { plannedMinor; paidMinor; differenceMinor; direction: "more" | "less" | "same" };
//   estimatedCount: number }
// PlanRow = { itemId; month; name; target; accountId; dueDate; plannedMinor; estimated; notSet; paidMinor;
//   leftMinor; overpaidMinor; upcomingMinor; status: "paid" | "part_paid" | "due" | "due_today" | "overdue" | "skipped";
//   daysLate?; links: { id; amountMinor; date }[]; likely?: string /* transaction id */;
//   previousPaidMinor; removed: boolean }

likelyMatches(row: PlanRow, item: PlanItem, candidates: TransactionView[]): TransactionView[]   // R7-07
paysSuggestions(draft: TransactionDraft, rows: PlanRow[], items: PlanItem[]): PlanRow[]
payDraft(row: PlanRow, item: PlanItem, today: string, accounts): TransactionDraft            // R7-10
planUnpaidForSafeToSpend(view: PlanMonthView, items, countedAccountIds, monthEnd): bigint   // R7-08
nudgeFor(today: string, prefs: { planNudge: boolean; planCheckedMonth: Month | null }): Month | null  // R7-09
```

All pure, with no DOM or React; tested on `test/vectors/plan.json`, which covers frequencies, month
ends, terms, estimates, part payments, overpaid, carry-forward, timezone "today" and the nudge window.

### As built (2026-11-14)

- `planMonth` takes no `candidates`: the screen marks "Looks paid — link?" with
  `withLikely(rows, items, candidates)` (each transaction offered to one row only).
- `payDraft(row, item, today, live)` takes the sets of live account, payee and category ids, so anything
  archived or deleted since is left empty.
- Also exported: `nudgeWindowMonth`, `planCheckMonth` (the one month "Plan checked" is offered for),
  `isPlanChecked`, `isNudgeSnoozed`, `moveStart` (terms for a new start month), `monthName`,
  `parseMonthParam`, `amountNear`, `paysTarget`, `isVarying`, `statusOf`.
- `PlanRow.links` carry `counted`; `PlanMonthView` carries `currentMonth`.
- Extra test ids: `[data-plan-row]` also has `data-name`, `data-month`, `data-due`; `[data-plan-status]`,
  `#plan-carried`, `[data-cash-account]`, `#plan-compare-*`, `[data-compare-row]`, `#plan-people-*`,
  `[data-plan-person]`, `#plan-checked`, `[data-looks-paid]`, `[data-link-candidate]`, `#pays-plan`,
  `#safe-plan` (Dashboard), `#plan-nudge-setting` (Settings).
