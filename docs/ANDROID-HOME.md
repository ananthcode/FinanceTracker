# Android home screen and look (owner decisions, 2026-10-31)

The phone is mainly used to **record transactions**, so the Android app is built around that. These
decisions apply from the Android client of R4 (Transactions, `specs/004-transactions` Story 8,
T053) onward; the web app keeps its own layout.

## Opening screen

- The app **always opens on the Transactions home screen** (after sign-in and app lock).
- Top of the screen, in this order:
  1. Greeting with the user's display name and a **month picker** (current month by default).
  2. **Total balance**, large: the sum of all accounts included in net worth, as of today.
  3. Two cards side by side: **Income** and **Expenses** for the selected month.
     Tapping a card **filters the list** to that kind; tapping it again shows everything.
  4. **Cashflow** line for the month (income − expenses), with a + or − sign.
- Below: the month's transactions grouped by day, newest first, each day with its total.
  Each transaction shows its category chip (in the category's colour, with its icon), the account,
  the payee or note, and the amount with an income/expense icon.

## Bottom bar

- Two tabs and a centre button, as in the owner's current app:
  **Home** (transactions) · **[ + ]** · **Accounts**.
- The centre **+** is a large round button that opens "Add transaction" from anywhere.
- Everything else (People, Categories, Payees, Tags, Payment plan, Dashboard, Settings, App lock,
  User management) moves into a menu opened from the header.
- The menu is also opened by **dragging down from the top** of the Home screen: a pull-down panel
  with large, labelled shortcuts. It closes by dragging it back up, tapping outside or Back. Drag is
  never the only way in — the header menu button does the same (Principle XIII, TalkBack users).

## Look

- **Bright and colourful**, so information reads at a glance:
  income card in a green gradient, expense card dark, category chips in each category's own colour,
  a purple **+** button, rounded cards on a light background.
- Colour never carries meaning alone (Principle XIII): amounts keep their +/− sign and an
  income/expense icon, cards have text labels, and every chip shows its name.
- Every amount still goes through `<Money>`, so hide-balances masks the balance, cards, cashflow,
  day totals and transactions alike.
- Dark mode uses the same hues on dark surfaces.

## Adding a transaction (the + button)

Goal: a usual entry in **three taps** — type, amount, category — then Save, with the account and
date filled in from the last entry. Mock-ups are kept outside the repo (they were drawn from the
owner's current app).

1. **Choose type** — four large colour tiles over a dimmed Home: Expense (dark), Income (green),
   Transfer (purple), Planned (amber). Above them, "Repeat a recent one" chips save a recent entry
   in one tap. A close button sits where the + was.
2. **Amount and account** — account chips across the top (the last-used one selected, its balance
   shown), a large amount, quick-amount chips, and a number pad with **÷ × − +** built in so
   `120+45` gives 165 without a separate calculator. "Next: category".
3. **Category** — search (category or payee), "Suggested now" from time of day and history, then
   all categories of that kind as coloured chips; a › opens sub-categories; "New" adds one; Skip.
4. **Review and save** — the top scrolls: payee or title (with suggestions), category, tags, note,
   date and time, optional person. **Fixed at the bottom**: "Pay with" account chips, the amount and
   **Save**. Choosing a payee fills in its default category.
5. **Transfer** — From and To account chips with a **swap** button between them, each showing the
   balance after the move; amount; optional fee, note and date; "Transfer ₹N".
6. **Planned: details** — Expense / Income / Transfer switch, title, category, a schedule line in
   plain words ("Every month on the 5th", next dates) that opens step 7, reminder, note. Fixed at
   the bottom: "Pay with" (or From/To for a transfer), the amount and **Set plan**.
7. **Plan for** (bottom sheet) — One time or Repeats; **Starts on** with a calendar button;
   **Repeats every** N (− / +) of **Day, Week, Month or Year**; **Ends**: Never, On a date, or
   **After N times** chosen on a **spin wheel** (default 12, range 1–360, light vibration per step,
   adjustable by TalkBack), with the last date shown beside it; a plain-words summary
   ("Monthly on the 5th, 12 times: 5 Nov → 5 Oct"); Set.

Due planned payments appear in "To confirm" (R4). Fees, planned payments and the person link are
checked against `specs/004-transactions` when built.
