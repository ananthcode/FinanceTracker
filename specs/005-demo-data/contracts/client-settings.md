# Contract: Settings › Your data (R5)

| Element | Behaviour |
|---------|-----------|
| "Your data" section in `/settings` | Says what demo data is and that reset cannot be undone |
| "Load demo data" button | Shown when the user has no records and demo data is available; confirms in a dialog (no typing); then states what was added |
| "Reset my data" button | Shown when the user has records; dialog lists what is removed (accounts, groups, categories, tags, payees and people, transactions, interest rates and their history) and what stays (sign-in, profile, preferences); "Reset" enabled only when "RESET" is typed |
| "Reset and load demo data" button | Shown when the user has records and demo data is available; same typed confirmation |
| Outcome | A status message in words; every screen shows the new state without a reload |
