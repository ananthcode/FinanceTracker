# Quickstart & Validation: Accounts & Balances (R2)

How to prove R2 works locally. Setup is R1's ([R1 quickstart](../001-identity-access-shell/quickstart.md#local-setup));
details live in [contracts/](contracts/) and [data-model.md](data-model.md). All data below is
synthetic.

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

Sign in as a set-up member (any synthetic user from R1's E2E helpers) and open `/accounts`.

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
| Vitest `packages/core` | Amount parsing, balance/summary vectors, fractional keys, HLC, merge (SC-002) |
| pgTAP `supabase/tests/accounts*.test.sql` | Access rules 1–8 ([database.md](contracts/database.md)), constraints, merge, idempotency, state rules, audit (SC-004, SC-005) |
| Integration `apps/web/app/api/sync/*.int.test.ts` | Push/pull with two simulated devices (SC-007 server side) |
| Playwright `apps/web/e2e/r2-*.spec.ts` | Stories 1–4, hide-balances, accessibility, SC-001, SC-003 |

## Manual validation (web)

| # | Steps | Expected |
|---|-------|----------|
| S1-a | New user opens Accounts | Empty state with "Add account" |
| S1-b | Add "Everyday Savings" (bank, ₹52,340.50, 01-Apr-2026), "Cash in hand" (cash, ₹2,000.00), "Rewards Card" (credit card, ₹18,250.00) | Listed under Bank accounts / Cash / Credit cards; card shows "₹18,250.00 owed" |
| S1-c | Add "everyday savings"; set a future date; type `1,234.567` | Each refused with a clear message; nothing saved |
| S2-a | View summary | Owned ₹54,340.50 · Owed ₹18,250.00 · Net worth ₹36,090.50; subtotals match |
| S2-b | Set Everyday Savings opening balance to −₹500.00; mark Cash excluded | "overdrawn" label; Cash shows "excluded"; totals recompute exactly |
| S2-c | Turn hide-balances on | Every amount on Accounts masked (SC-006) |
| S3-a | Rename, recolour, change icon, reorder by drag and by keyboard (Move up) | Updates at once; order kept after reload and on another browser |
| S3-b | Change Cash's type to credit card | Confirmation explains the totals change; cancel keeps it as cash |
| S3-c | Create groups "My accounts", "Held for family"; assign; switch to My groups; delete a group | Accounts under their groups / "Ungrouped"; totals unchanged; deleting moves accounts to Ungrouped |
| S4-a | Archive a ₹0.00 account; try to archive a non-zero one | First moves to Archived accounts, totals unchanged; second is refused showing the balance |
| S4-b | Restore it; delete a never-used account; create one with an archived account's name | Restored in place; deleted one gone everywhere; name refused with "restore it" hint |
| S4-c | Two tabs: rename in tab 1, change colour in tab 2 | Both changes kept (per-field merge) |
| S-perf | Seed 50 active + 50 archived accounts; open Accounts | Balances and summary within 2 s (SC-003) |
| S-iso | As another user and as the owner-admin, try to see the first user's accounts (UI, REST, RPC) | Nothing visible (SC-004) |

## Android (Android phase — Story 5)

| # | Steps | Expected |
|---|-------|----------|
| S5-a | Airplane mode; add "Petrol cash"; rename "Rewards Card" to "Travel Card" | Saved at once; "2 changes waiting" |
| S5-b | Airplane mode off | Within 1 min both appear on the web; waiting count clears; no duplicates |
| S5-c | Offline on phone: rename an account; on web: change its colour; reconnect | Both kept |
| S5-d | Offline on two devices: create "Fuel" on each; reconnect both | Two accounts, the second "Fuel (2)", user told (FR-032) |
| S5-e | Sign out with pending changes | R1 unsent-changes warning lists them |
