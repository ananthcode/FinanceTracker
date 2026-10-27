# Contract: Categories, tags, payees and people screens (R3)

Extends R1's client-shell and [R2's accounts](../../002-accounts-balances/contracts/client-accounts.md)
contracts. Web now; Android screens follow in the Android phase.

## Navigation (FR-034)

Main navigation: Dashboard, Accounts, **People**, Transactions, Payment plan, Settings (desktop
sidebar and phone drawer). Settings gains a "Lists" section linking Categories, Payees and Tags.

## Routes

| Route | Purpose |
|-------|---------|
| `/people` | People totals ("People owe you", "You owe people") at the top; each person with balance and direction label; hidden people in a collapsible section; "Add person"; empty state |
| `/people/new`, `/people/[id]` | Person form: name, opening balance with direction ("They owe me" / "I owe them"), date, default category, notes, "Include in net worth", hide; Merge and Delete under "Manage person" |
| `/settings/categories` | Start choice (first visit, FR-007); Expense and Income trees with expand/collapse, search; per category: Add sub-category, Edit (name, colour, icon), Move, Hide/Unhide, Merge, Delete; "Add suggested categories" while empty |
| `/settings/payees` (+ `new`, `[id]`) | Search-as-you-type list with kind filter (All / Businesses / People) and "Show hidden"; payee form (kind, default category, notes; person fields when kind is Person); Merge and Delete |
| `/settings/tags` | Alphabetical tag list; add, rename inline; Merge and Delete with confirmation |

## Screen rules

- Every category shown outside its tree uses its full path; every category choice uses the shared
  `CategoryPicker` (search by any part of a name; hidden categories and their descendants left out
  unless already selected; grouped Expense / Income; keyboard operable) — reused by R4.
- The start choice is a dialog that blocks the Categories screen and any picker until answered;
  "Start with suggested categories" is preselected.
- Person balances go through `<Money>` with a direction label; never sign or colour alone (FR-018);
  hide-balances masks them all (FR-021). The accounts summary shows a "People" line when any person
  is included in net worth (FR-020).
- Merge dialogs choose the target with the picker (categories: same kind, not the source or its
  descendants; payees: same kind) and state what will move before confirming (FR-023, FR-024).
- Delete is offered only when allowed (no sub-categories, no activity); otherwise the dialog explains
  and offers Hide or Merge (FR-025). A category delete states how many payees lose it as default.
- Rejections (`NAME_TAKEN`, `INVALID_MOVE`, …) are shown next to the field or action in words.

## Shared primitives (packages/core)

| Primitive | Contract |
|-----------|----------|
| `DEFAULT_CATEGORIES` | The spec's default tree (name, kind, colour, icon, children) |
| `buildCategoryTree(categories)` | Kind → sorted tree; effective hidden per node |
| `categoryPath(id, index)` | "A › B › C" |
| `searchCategories(query, tree, opts)` | Case-insensitive substring match on any level, with paths; excludes hidden unless asked |
| `canMoveCategory`, `canMergeCategory`, `mergePreview` | Same rules as the server (client hints; the server decides) |
| `personBalance(payee, movements)`, `peopleTotals(payees)`, `personLabel(balance)` | Exact `bigint`; labels "owes you" / "you owe" / "settled" |
| `summarise(…, { people })` (R2, extended) | Adds included people to Owned / Owed; returns the People line |
| `CategoryCreateFields`, `CategoryUpdateFields`, `TagFields`, `PayeeCreateFields`, `PayeeUpdateFields`, `MergeFields` | Zod schemas used by forms and the sync protocol |
| `demoLists()` | Deterministic synthetic categories, tags, payees and people (R3-15) |
| `APPEARANCE_ICON_KEYS` | 48 icon keys; accounts keep the first 24 |
