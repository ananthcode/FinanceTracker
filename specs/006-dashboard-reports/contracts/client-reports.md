# Contract: Screens (R6)

| Route | Content |
|-------|---------|
| `/` Dashboard | Net worth (owned / owed / net) · This month: income, spending, net · Safe to spend with its four parts and "Change buffer" · To confirm count · People owe you / You owe people · links to each screen; empty state with first steps |
| `/reports` | Tabs Spending · Income · Trend; period picker (This month, Last month, This financial year, Last 12 months, Custom); breadcrumb; bar list per level (category → sub-category → payee) with "Show as table"; payee level → transactions list (R4 rows) |
| `/reports?view=trend` | Income, spending and net per month (last 12 months or a financial year); select a month → spending for that month |
| `/people/[id]/statement` | Range picker; opening balance; rows (date, type, amount, running balance, notes on screen); closing balance in words; sign setting; "Include notes" switch; Download image (PNG) · Download PDF |
| `/settings` | Buffer amount in Preferences |

Navigation: "Reports" after Transactions; the person page links to "Statement". Every amount through
`<Money>` on screen; downloaded files show real amounts (spec US4 5).

As built:

- Report URL: `/reports?view=spending|income|trend&period=this_month|last_month|this_fy|last_12_months|custom&from=…&to=…&cat=<category id|uncategorised>&own=1&payee=<payee id|none>`.
  A category with sub-categories lists them plus "<name> itself" (`own=1`), which opens its payees.
- The payee level lists each transaction with its share in the category (a split shows only its
  lines there) and a total equal to the payee's amount; at most 200, with a note when there are more.
- Statement URL: `/people/[id]/statement?from=…&to=…`; default this financial year up to today; the
  sign setting saves at once (synced person field); downloads are named
  `Statement - <person> - <from> to <to>.png|pdf`.
- Transactions filters gained `exact=1` (with `category`) and `payee=none`.
