# Research: Dashboard, Drill-down Reports & Person Statements (R6)

## R6-01 Category and payee totals from postings

**Decision**: `app.category_payee_totals(p_from, p_to)` (SECURITY DEFINER, `auth.uid()`): one row per
(kind, category_id — null for Uncategorised, payee_id — null for none) with the sum of counted
category postings dated in the range (the payee is the transaction's; split lines carry their own
category). Core `categoryTree(rows, categories, payees)` rolls categories up, adds "On <category>
itself" rows where a parent has spending of its own, and lists payees under each category — every
level adds up to the level above because it is built from the same rows.

**Rationale**: postings already apply R4's counting rules (refunds negative, transfers, people and
interest excluded); one query per period serves every drill level (SC-003).

## R6-02 Month totals

**Decision**: `app.month_totals(p_from, p_to)`: per calendar month, income and spending (net of
refunds) from counted category postings. Used by the Dashboard (this month) and the trend.

## R6-03 Transactions behind a payee

**Decision**: the last drill level is the R4 search with two new filters: `categoryExact` (the
category itself, not its sub-categories) and `payeeId: "none"`. Its count and total equal the tree's
number for that payee (tested).

## R6-04 Safe to spend (clarify Q1)

**Decision**: core `safeToSpend({ accounts, balances, upcoming, buffer })`:
held (bank, cash, wallet; active or archived-with-balance; in net worth) − credit-card owed (in net
worth) − outgoings of transactions not confirmed and dated up to the end of this month (expenses and
person movements out of an account counted in net worth, from held accounts or cards; transfers and
income skipped) − buffer. Returns each part and the result; below zero → 0 with the shortfall.
The upcoming list is the R4 search `{ upcoming: true, to: monthEnd }` (at most a few hundred).

## R6-05 Statements

**Decision**: core `personStatement(person, transactions, range, sign)`: opening = opening balance +
counted effects dated from the person's opening date to the day before the range; rows = counted
movements in the range in date (then time, then entry) order with `transactionLabel`, the effect and
the running balance; closing = last running balance. The sign setting multiplies displayed amounts by
−1 for "I owe them is positive"; words come from the balance's real direction. The person's
transactions come from the R4 search `{ payeeId }`, all pages.

## R6-06 PNG and PDF in the browser

**Decision**: the statement is drawn on a `<canvas>` (A4 proportions, fonts as on screen) page by page;
PNG = the pages stacked into one image (`canvas.toBlob`); PDF = core `pdfFromJpegPages(pages)`, a
minimal writer: one page object per image, each image embedded as a JPEG (`DCTDecode`), correct
cross-reference table. Nothing is uploaded; nothing is logged.

**Alternatives**: jsPDF / pdf-lib (a dependency, and text needs an embedded font for ₹); the browser's
print dialog (not a download, varies by browser).

## R6-07 Charts

**Decision**: horizontal bar lists for category/payee levels (each bar a link with name, amount and
share in text; slices under 2 % grouped as "Other" only in the chart, never in the table) and grouped
vertical bars for the trend, as SVG with a `<table>` alternative (`details` "Show as table"). Colours
come from the category appearance; patterns are not needed because every value is labelled in text.

## R6-08 New fields

**Decision**: `user_preferences.buffer_minor bigint not null default 0 check (>= 0)` via the R1
preferences endpoint (optional field — forms omit what they do not edit, R3 lesson); `payees.
statement_sign` enum, synced: `_apply_payee` allow-list, core payee schemas and view, pull, mobile row
mapper (R4 lesson: every client mapping must learn a new required field in the same PR).

## R6-09 Navigation and URLs

**Decision**: "Reports" joins the main navigation after Transactions. Report state is in the URL
(`/reports?view=spending|income|trend&period=…&from=…&to=…&category=…&payee=…`), so the breadcrumb and
the browser's back button work and a report can be bookmarked.
