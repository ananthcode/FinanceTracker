# R4 Transactions — review notes

Kept during implementation; completed at T058. Items marked **Owner** need a decision at the PR.

## Decisions and interpretations

- **Owner — rate changes and waiting proposals (US4 scenario 4 vs FR-014).** A proposal that is
  still waiting (not confirmed, edited or deleted) is recomputed from the month's opening balance
  *and the rate history as it is now*. So adding or removing a rate for a month that has ended
  changes that month's waiting proposal; confirmed, edited and deleted proposals never change. The
  alternative — freezing the rate each proposal was made with — needs a rate column on proposals.
  Recommendation: keep as built (waiting means "not decided yet"); change if you want rates frozen.
- **A waiting proposal that recomputes to ₹0.00 is withdrawn** (soft-deleted): an amount must be at
  least ₹0.01. Like any deleted proposal, it is then not recreated for that month.
- **Months that get interest** start with the first month beginning on or after the person's opening
  date (an opening on 15-Aug starts with September) and need a rate in force on their 1st.
- **Proposals run** on every full page load (the signed-in layout) and on the Transactions and person
  pages, because a shared layout is not re-rendered on client navigation. Android calls
  `POST /api/interest/propose` (30 a minute per user).
- **Postings live in `private.transaction_postings`**, not `app` as the plan said: they are never read
  by clients; `app.balance_movements()` gives screens every balance total in one read.
- **T047 (search) was built with US1**, which needs the list.

## Fixes found while testing

- **Payee creates were refused since R4 core** sent `interestMode` by default and the R3 SQL write
  path did not allow it (every payee and person add failed with VALIDATION_FAILED). Fixed in
  `20261101000009_tx_payee_interest.sql`, with pgTAP and an integration test.
- **Android `applyLocally`** did not handle the new `relocate` change kind (typecheck failure after
  merging `main`); a relocate leaves the source row as it is locally.
