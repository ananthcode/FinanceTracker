# Research: Categories, Tags & Payees (R3)

Decisions for the plan. R3 adds three new kinds of synced record to the R2 sync engine; it builds
no new transport. Each entry: **Decision**, rationale, alternatives.

## R3-01 Three new synced entities on the R2 engine

**Decision**: `category`, `tag` and `payee` become sync entities beside `account` and
`account_group`. Each table follows R2's synced-table conventions (client UUIDs, `field_versions`,
`server_seq` stamped under the per-user advisory lock, SELECT-only grants, RLS select-own, audit
trigger). All writes go through `app.apply_changes`; pulls through `app.pull_changes`.

**Rationale**: R2's plan made the protocol entity-generic for exactly this (R2-01, R2 plan
"Structure Decision"). Reusing it gives the per-field rule, idempotency and history for free.

**Alternatives**: plain REST tables with RLS writes for these "simpler" lists — rejected: they
must sync offline on Android (FR-031) and would bypass the merge and name rules.

## R3-02 Category tree: adjacency list with a kind column

**Decision**: `categories.parent_id` (nullable) plus `kind` (`expense` | `income`). A composite
foreign key `(parent_id, user_id, kind) → categories (id, user_id, kind)` guarantees in the database
that a parent belongs to the same user and has the same kind. Paths, sorting, effective hidden
state and search are computed in `packages/core` from the full list (≤ 500 rows). Moves are checked
for cycles in `apply_changes` with a recursive query.

**Rationale**: a move is one field (`parentId`), so it merges under the per-field rule like any
other edit. All categories are loaded anyway for pickers, so the tree is built in memory.

**Alternatives**: materialised path / `ltree` — a move rewrites every descendant row, so concurrent
offline moves conflict across many rows; nested sets — same problem, worse. A depth column — not
needed and would also need rewriting on moves.

## R3-03 Sibling-unique names; suffix on offline clashes

**Decision**: unique index on `(user_id, kind, coalesce(parent_id, nil-uuid), lower(name))` where
`state <> 'deleted'`. Web creates/renames use `onNameConflict: "reject"` (`NAME_TAKEN`); synced
creates use `"suffix"` (" (2)") as in R2 (FR-032). A move into a parent that already has a
same-named child is rejected (`NAME_TAKEN`) — the UI suggests merge. Tags and payees: unique per
user on `lower(name)` among non-deleted rows.

## R3-04 Hide is a field, not a state

**Decision**: `hidden boolean` on categories and payees, written with ordinary `update` changes and
merged per field. `state` keeps R2's meaning (`active` | `deleted`). "Hidden from pickers" for a
category is derived in core: hidden itself or any ancestor hidden.

**Rationale**: a hidden record can still be renamed or moved; making hide a state would make those
edits conflict with it. Unhide is just `hidden = false`.

**Alternatives**: R2-style `archived` state — rejected for the reason above.

## R3-05 Merge is a server-side change kind

**Decision**: a new change kind `merge` with `fields: { targetId }`, allowed for `category`, `tag`
and `payee`. `apply_changes` performs it atomically:

- **Category** (recursive): for each non-deleted child of the source, if the target has a child with
  the same name (ignoring case) merge the child into it, else set its `parent_id` to the target;
  repoint references (payee `default_category_id` now; transaction and split categories in R4,
  budgets later) from source to target; mark the source `deleted` with `merged_into = target`.
- **Payee**: repoint references (transactions in R4); append the source's notes to the target's
  (newline-separated, capped at 500 characters — the tail is cut and the full text stays in the
  history); for two people add the source's opening balance to the target's and keep the earlier
  date; mark the source deleted with `merged_into`.
- **Tag**: relabel records (R4's transaction tags, never twice); mark the source deleted with
  `merged_into`.

Every row touched is written through the normal triggers, so each gets its `server_seq` and its own
history entry; the change context carries `kind = merge`, the source and the target. Checks: same
entity, both owned and not deleted, same kind (category expense/income; payee business/person), the
target is not the source or (categories) one of its descendants — else `INVALID_MERGE`.

Each module that adds a reference to categories, tags or payees registers its repointing in the
merge functions (R4 transactions, splits, tags; later budgets). This is listed in review notes.

**Rationale**: a merge touches many rows; doing it on the server in one transaction keeps it exact
and makes an Android merge safe to replay (idempotent change id, FR-033).

**Alternatives**: client-side merge as many updates — not atomic, and a device cannot see records it
has not pulled.

**Conflicts**: an edit to a merged (deleted) source arriving later is `NOT_FOUND`, as R2 does for
deleted accounts; the merge itself is in the history.

## R3-06 Default categories: one start choice, server-side, first wins

**Decision**: `user_preferences.categories_start` (`null` | `suggested` | `empty`). The web calls
`POST /api/categories/start { choice }`, which calls `app.start_categories(p_choice, p_defaults)`
(SECURITY DEFINER, scoped to `auth.uid()`):

- Takes the user's advisory lock (the same one as `sync.stamp_row`).
- If `categories_start` is null, sets it to the choice (first answer wins — spec edge case).
- If the effective choice is `suggested` and the user has no non-deleted categories, inserts the
  default tree from `p_defaults` (server-generated ids, `onNameConflict` not needed) with audit device
  type `web`.
- "Add suggested categories" calls the same function with `suggested` while the user has no
  categories; it adds the defaults even if the first answer was `empty`.
- Returns `{ choice, added }`; a second concurrent call finds categories present and adds nothing.

The default list lives only in `packages/core` (`DEFAULT_CATEGORIES`: name, kind, colour, icon,
children); the route passes it, and the function validates it like any category (lengths, keys,
depth ≤ 2 for defaults). Android (later) makes the same call when online; offline it shows the
choice once connected.

**Rationale**: one source of truth for the list; the lock and the "no categories yet" check make
duplicates impossible (SC-008) without deterministic ids.

**Alternatives**: deterministic UUIDv5 ids per user and default — collide with deleted defaults if a
user later adds them again; seeding in a migration or sign-up trigger — contradicts the owner's
"start empty" option.

## R3-07 Person ledger on the payee row

**Decision**: payees carry `kind` (`business` | `person`), `opening_balance_minor bigint not null
default 0`, `opening_balance_date date`, `include_in_net_worth boolean not null default false`. Sign:
**positive = they owe the user**, negative = the user owes them. A check constraint keeps businesses
at 0, no date, not included. `packages/core/src/people/` holds `personBalance`, `peopleTotals`,
`personLabel` ("owes you" / "you owe" / "settled"); `app.person_balance_minor(id)` is the SQL twin
(opening balance until R4), used to refuse person → business while not ₹0.00. Both run the shared
`vectors/people.json`.

**Rationale**: same pattern as R2 balances (R2-07): derived, never stored, TS and SQL proven equal.
A positive receivable matches how net worth counts it.

**Alternatives**: a separate `people` table — a person is a payee in every R4 transaction, so one
table avoids a join and a second identity.

## R3-08 Net-worth inclusion extends `summarise`

**Decision**: `summarise(accounts, { view, groups, movements, people })` gains an optional `people`
list. Included people with a positive balance add to Owned, negative to Owed; the result gains
`people: { owedToYou, youOwe }` so the summary's "People" line can be shown and every figure still
adds up (FR-020). The accounts page loads included people with the accounts. R2's balance vectors are
extended with people cases.

## R3-09 Icons: one shared icon set, extended

**Decision**: rename the R2 icon list to `APPEARANCE_ICON_KEYS` (accounts keep `ACCOUNT_ICON_KEYS` as
its first 24 entries, unchanged) and add 24 category-oriented keys (e.g. `shopping-cart`, `zap`,
`droplet`, `flame`, `wifi`, `tv`, `bus`, `wrench`, `stethoscope`, `pill`, `book`, `shirt`, `laptop`,
`sparkles`, `party-popper`, `hand-heart`, `paw-print`, `film`, `ticket`, `bed`, `shield`,
`landmark`, `percent`, `package`). Categories accept the full 48; the colour palette is R2's 12.

**Rationale**: category trees need icons accounts never use; keeping one catalogue keeps the web
icon map and the database check lists in one place.

## R3-10 "Has activity" placeholders until R4

**Decision**: `app.category_has_activity(id)` and `app.payee_has_activity(id)` return `false` in R3
(as `app.account_has_activity` in R2) and R4 replaces them. Delete rules: a category also needs no
non-deleted children (`HAS_SUBCATEGORIES`); deleting a category clears it as default on the user's
payees in the same transaction (each payee audited). Tags have no activity until R4; deleting one
needs only confirmation.

## R3-11 New rejection codes

**Decision**: `HAS_SUBCATEGORIES` (delete with children), `INVALID_MOVE` (cycle, other kind or
other user's parent), `INVALID_MERGE` (R3-05 checks). Reused: `NAME_TAKEN`, `LIMIT_REACHED`,
`DATE_IN_FUTURE`, `BALANCE_NOT_ZERO` (person → business), `HAS_ACTIVITY`, `NOT_FOUND`,
`VALIDATION_FAILED`.

## R3-12 Limits

**Decision**: enforced in `apply_changes` on create: 500 non-deleted categories, 500 tags, 2,000
payees per user (`LIMIT_REACHED`). No depth limit (spec FR-002); cycle checks bound the recursion.

## R3-13 Web screens and navigation

**Decision**: `/people` (+ `/people/new`, `/people/[id]`) as a new main-navigation entry after
Accounts (FR-034); `/settings/categories`, `/settings/payees` (+ `new`, `[id]`), `/settings/tags`
linked from Settings. A shared `CategoryPicker` (combobox: search by any part of a name, results
shown with full path, hidden categories excluded unless already selected) is built here and reused
by R4. Category tree rows use disclosure buttons (expand/collapse) and a Move dialog that uses the
picker, so moving is keyboard-accessible without drag and drop (ordering is alphabetical, FR-004).
Lists of 2,000 payees render as plain filtered lists (no virtualisation) — measured in the
performance test (SC-002).

## R3-14 History actions

**Decision**: new `audit_action` values `category_created`, `category_edited`, `category_moved`,
`category_hidden`, `category_unhidden`, `category_merged`, `category_deleted`,
`category_sync_renamed`, `tag_created`, `tag_renamed`, `tag_merged`, `tag_deleted`,
`tag_sync_renamed`, `payee_created`, `payee_edited`, `payee_hidden`, `payee_unhidden`,
`payee_merged`, `payee_deleted`, `payee_sync_renamed`; `target_type` gains `category`, `tag`,
`payee`. R2's `audit.capture_record_change` derives the action; it learns `parent_id` → moved,
`hidden` → hidden/unhidden and `kind = merge` from the change context. Erasure deletes these rows
(as R2-08). The start choice is captured by R1's preference audit.

## R3-15 Demo data

**Decision**: `packages/core/src/demo/lists.ts` returns a deterministic set: the default categories
plus custom nested ones (three levels deep), one hidden category, five tags, eight businesses with
default categories, four people (owes you, you owe, settled, one included in net worth), one hidden
person with a balance. Fixed UUIDs; synthetic names only. R5's loader inserts it with R2's accounts.

## R3-16 Housekeeping carried from R2

**Decision**: fix the stale "422" comment in `packages/core/src/sync/schemas.ts` (the contract is
`400`); extend `PullResponse.rows` with the new entities.
