# Contract: Accounts screens and shared primitives (R2)

Extends [R1's client-shell contract](../../001-identity-access-shell/contracts/client-shell.md).
Web in this module; Android screens in the Android phase follow the same contract.

## Routes / screens

| Route | Purpose |
|-------|---------|
| `/accounts` | Summary (Owned, Owed, Net worth) + accounts in the chosen view + "Archived accounts" section; empty state (US1) |
| `/accounts/new` | Add account form (dialog on wide screens, page on narrow) |
| `/accounts/[id]` | Edit account; Archive / Restore / Delete actions |
| `/accounts/groups` | Manage user groups: create, rename, reorder, delete (FR-009a/b) |

## Screen rules

- View switch **By type / My groups** (FR-009), remembered via `accountsView` preference.
- Each row: icon (colour token), name, type label, balance via `<Money>` with label
  ("owed", "in credit", "overdrawn", "excluded from net worth", "archived with a balance");
  Move up / Move down buttons and a drag handle (FR-010, R2-09).
- Group headers show the subtotal; user groups that mix kinds label it "net" (FR-017).
- Summary and every amount go through `<Money>` → hide-balances masks all (FR-020).
- Forms validate with the shared Zod schemas; the amount field uses `parseAmountInput` and shows
  its errors in words; the date field defaults to today in the user's timezone (FR-003, FR-004).
- Type change between owned and owed opens a confirmation describing the effect on totals
  (FR-011). Archive with a non-zero balance is not offered as enabled: the button explains why
  (FR-022). Delete is only shown when the account has no activity (FR-024).
- After a successful push the screen refreshes (FR-014); a rejected change shows its message next
  to the field or action.

## Shared primitives (packages/core — only path for these concerns)

| Primitive | Contract |
|-----------|----------|
| `parseAmountInput(text, opts)` | String → `bigint` paise or typed error; never rounds (R2-11) |
| `currentBalance(account, movements)` | Exact `bigint`; movements empty until R4 (R2-07) |
| `summarise(accounts, view, groups)` | Per-group subtotals, Owned, Owed, Net worth; excludes archived/excluded (FR-016–FR-018) |
| `balanceLabel(account, balance)` | `owed` / `in credit` / `overdrawn` / none (FR-015) |
| `ACCOUNT_COLOURS`, `ACCOUNT_ICONS`, `defaultAppearance(type)` | Keys only; apps map to rendering (R2-10) |
| `keyBetween(a, b)` | Fractional index keys (R2-06) |
| `Hlc` (`next`, `observe`, `compare`, `clamp`) | Sync clock (sync-protocol.md) |
| `mergeFields(row, change, receivedAt)` | Pure per-field merge; same vectors as the SQL tests |
| `AccountChange`, `GroupChange`, `ChangeResult`, `PullResponse` | Zod schemas (Principle VIII) |
