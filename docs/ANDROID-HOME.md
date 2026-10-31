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

## Look

- **Bright and colourful**, so information reads at a glance:
  income card in a green gradient, expense card dark, category chips in each category's own colour,
  a purple **+** button, rounded cards on a light background.
- Colour never carries meaning alone (Principle XIII): amounts keep their +/− sign and an
  income/expense icon, cards have text labels, and every chip shows its name.
- Every amount still goes through `<Money>`, so hide-balances masks the balance, cards, cashflow,
  day totals and transactions alike.
- Dark mode uses the same hues on dark surfaces.
