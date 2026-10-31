# Quickstart & Validation: Transactions (R4)

Setup as R2/R3 ([R3 quickstart](../003-categories-tags-payees/quickstart.md)). All data synthetic.

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
| Vitest `packages/core` | Postings, movements, balances, totals, interest proposals and rounding over shared vectors (SC-002, SC-007) |
| pgTAP `supabase/tests/tx_*.test.sql` | Access rules ([database.md](contracts/database.md)), validation, postings, activity, relocate, merges with transactions, interest proposals once per month, audit (SC-004, SC-005, SC-007) |
| Integration | Push/pull of transactions with two devices; lines win or lose together; TS/SQL parity for postings, balances and interest |
| Playwright `apps/web/e2e/r4-*.spec.ts` | Stories 1–7, To confirm, hide-balances, accessibility, SC-001 |

SC-003 (20,000 transactions) runs against a production build with `E2E_PRODUCTION=1`, as in R2/R3.

## Manual validation (web)

| # | Steps | Expected |
|---|-------|----------|
| S1-a | Expense Fresh Mart ₹1,234.50 (default category fills), income Acme Payroll ₹85,000.00 | Everyday Savings +₹83,765.50; list newest first |
| S1-b | Expense with no category | Saved as "Uncategorised" |
| S1-c | Refund ₹500.00 against Groceries | Groceries spending falls by ₹500.00 |
| S1-d | Date before Everyday Savings' opening date | Refused with a link to change the opening date |
| S1-e | Rent ₹25,000.00 dated in 4 days | "Upcoming", no balance change; after the date: "1 to confirm", confirm → counts |
| S2-a | Transfer ₹18,250.00 Everyday Savings → Rewards Card | Card owed ₹0.00; net worth and totals unchanged |
| S3-a | Lent Ravi ₹5,000; received back ₹8,000; paid ₹2,500 on his behalf | Ravi's balance follows; spending unchanged |
| S3-b | ₹3,000 bill split ₹1,000 Eating out + ₹2,000 paid on behalf of a friend | ₹1,000 spending; friend owes ₹2,000 more |
| S4-a | Ravi automatic, 1% from Apr; month ends | Proposal under To confirm; confirm → balance +1%; next month compounds |
| S5-a | Split ₹4,500 into three categories; try a split that doesn't add up | Each category shows its part; mismatch refused with amount left |
| S6-a | Filter Food & groceries (with sub-categories) in October; bulk-tag 5; relocate FreshMart → Fresh Mart | Count and total shown; tags added; all moved |
| S7-a | Mark Cleared, Follow-up, Void | Void excluded from balances, struck through |
| S-del | Try to delete an account, category or payee with transactions | Refused; archive / hide / merge offered |
