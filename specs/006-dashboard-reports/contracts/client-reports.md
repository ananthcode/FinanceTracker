# Contract: Screens (R6)

| Route | Content |
|-------|---------|
| `/` Dashboard | Net worth (owned / owed / net) · This month: income, spending, net · Safe to spend with its four parts and "Change buffer" · To confirm count · People owe you / You owe people · links to each screen; empty state with first steps |
| `/reports` | Tabs Spending · Income · Trend; period picker (This month, Last month, This financial year, Last 12 months, Custom); breadcrumb; bar list per level (category → sub-category → payee) with "Show as table"; payee level → transactions list (R4 rows) |
| `/reports?view=trend` | Income, spending and net per month (last 12 months or a financial year); select a month → spending for that month |
| `/people/[id]/statement` | Range picker; opening balance; rows (date, type, amount, running balance, notes on screen); closing balance in words; sign setting; "Include notes" switch; Download image (PNG) · Download PDF |
| `/settings` | Buffer amount in Preferences |

Navigation: "Reports" after Transactions. Every amount through `<Money>` on screen; downloaded files
show real amounts (spec US4 5).
