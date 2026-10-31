# Quickstart & Validation: Categories, Tags & Payees (R3)

How to prove R3 works locally. Setup is R1's and R2's
([R2 quickstart](../002-accounts-balances/quickstart.md)); details live in [contracts/](contracts/)
and [data-model.md](data-model.md). All data is synthetic.

## Run

```bash
pnpm db:reset
```

```bash
pnpm db:types
```

```bash
pnpm dev
```

Sign in as a set-up member and open **People**, then **Settings › Categories / Payees / Tags**.

## Automated checks

```bash
pnpm test
```

```bash
pnpm db:test
```

```bash
pnpm --filter @ft/web test:int
```

```bash
pnpm e2e
```

| Suite | Proves |
|-------|--------|
| Vitest `packages/core` | Tree, paths, search, move/merge rules, defaults shape, person balances, People totals, net-worth inclusion vectors (SC-003, SC-004) |
| pgTAP `supabase/tests/lists*.test.sql` | Access rules 1–8 ([database.md](contracts/database.md)), constraints, cycles, merges, start choice once (SC-005, SC-006, SC-008) |
| Integration `apps/web/app/api/**/*.int.test.ts` | Push/pull of the new entities with two devices, duplicate names, merges replayed, concurrent start choice, TS/SQL parity for person balances |
| Playwright `apps/web/e2e/r3-*.spec.ts` | Stories 1–5, hide-balances, accessibility, SC-001 |

SC-002 (500 categories, 2,000 payees) runs like R2's performance test: against a production build
with `E2E_PRODUCTION=1` (see the R2 quickstart's Performance section).

## Manual validation (web)

| # | Steps | Expected |
|---|-------|----------|
| S1-a | New user opens Settings › Categories | Start choice, "Start with suggested categories" preselected; accepting shows the Expense and Income trees |
| S1-b | Add "Kids" under Education, then "Swimming classes" under Kids; rename "Eating out" to "Restaurants"; move "Pets" to the top level | Each shows at once; picker shows "Education › Kids › Swimming classes" |
| S1-c | Add a second "fuel" under Transport; move Transport under one of its own sub-categories | First refused (name taken); second not offered |
| S1-d | Second user picks "Start empty" | Empty trees with "Add suggested categories" |
| S2-a | Add payee "Fresh Mart" (Business, default Food & groceries › Groceries, notes) and "fresh mart" | First listed with its default; second refused, existing one suggested |
| S3-a | Add people "Ravi Kumar" (they owe me ₹15,000.00, 01-Apr-2026) and "Meera Iyer" (I owe ₹4,500.00) | People: Ravi "owes you ₹15,000.00", Meera "you owe ₹4,500.00"; totals ₹15,000.00 / ₹4,500.00 |
| S3-b | Turn on "Include in net worth" for Ravi; open Accounts | Owned and Net worth rise by ₹15,000.00; a People line shows it |
| S3-c | Turn hide-balances on | Every amount on People and Payees masked |
| S4-a | Create tags "Goa trip", "Diwali", "Diwali 2026"; rename and merge "Diwali" into "Diwali 2026" | Two tags remain |
| S5-a | Hide "Education › Tuition & classes"; open a category picker | Not offered; still listed as hidden on Categories |
| S5-b | Merge a duplicate "FreshMart" into "Fresh Mart"; merge category "Restaurants" into "Food delivery" where both have a sub-category "Weekend" | One payee; one "Weekend" under Food delivery; payee defaults moved |
| S5-c | Delete the never-used "Pets" (with a payee defaulting to it) | Confirmation says 1 payee loses its default; Pets gone |
| S-perf | Seed 500 categories and 2,000 payees; open Categories, Payees, type in the picker | Screens open within 2 s; matches within 1 s (SC-002) |
| S-iso | As another user and as the owner-admin, try to see the first user's lists (UI, REST, RPC) | Nothing visible (SC-005) |

## Android (Android phase — Story 6)

| # | Steps | Expected |
|---|-------|----------|
| S6-a | Airplane mode; add payee "Corner Bakery" and category "Food & groceries › Bakery" | Saved at once; shown as waiting |
| S6-b | Reconnect | Both appear on the web within 1 min; no duplicates |
| S6-c | Offline on two devices: create tag "Fuel" on each; reconnect | Two tags, the second "Fuel (2)"; user told |
