# Quickstart: Demo Data (R5)

Local stack as R1–R4 (`pnpm db:start`, `pnpm --filter @ft/web dev`). Synthetic `@example.com` users only.

## Automated

| Suite | Command | Covers |
|-------|---------|--------|
| Core | `pnpm test` | `demoChanges` covers every kind, is valid on the wire, remaps every reference |
| Database | `pnpm db:test` | `data_*.test.sql`: own data only, all-or-nothing, at-most-once, history kept/removed, reset point |
| Integration | `pnpm --filter @ft/web test:int` | `/api/me/data` (confirmation, environment, rate limit); pull says `reset`; old push refused `DATA_RESET` |
| End-to-end | `pnpm e2e` | `r5-*.spec.ts`; a11y of the Settings section |

## Manual validation (web)

| # | Steps | Expected |
|---|-------|----------|
| S1-a | New member → Settings → Load demo data → confirm | Summary of what was added within 10 s; Accounts, People, Transactions (with To confirm), Categories, Payees, Tags all filled |
| S1-b | Two members load on the same day | Same balances, net worth and counts |
| S2-a | Reset my data → type RESET → Reset | Every screen in first-use state; Categories offers the start choice; still signed in, preferences kept |
| S2-b | Reset while a second tab is open; act in that tab | Refused cleanly; reload shows the empty state |
| S3-a | With edited data: Reset and load demo data → RESET | A fresh demo household, dated to today |
