# Feature Specification: Categories, Tags & Payees

**Feature Branch**: `003-categories-tags-payees`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Roadmap capability R3 (ROADMAP.md) — Categories, tags & payees: unlimited
nested categories seeded with sensible Indian defaults; free-form tags; payees with a default category
and notes; payees are either businesses or people; person payees carry a running ledger balance ('I owe
them' / 'they owe me') with an opening balance; hide, merge and relocate for categories and payees.
Reuses R2's sync so these records sync offline-first. Web first; the Android client follows in the
Android phase. Person-ledger movements, interest and statements are R4/R6."

## Clarifications

### Session 2026-10-27

- Q: Should money that people owe you, or that you owe them, count in the net worth figure on the Accounts screen? → A: Per person — each person has an "Include in net worth" switch, off by default; when on, money they owe you adds to Owned and money you owe them adds to Owed.
- Q: Should "Relocate" (moving everything recorded under one category or payee to another, keeping the original) be built in R4 with transactions instead of in R3? → A: Yes — relocate moves to R4; the roadmap is updated. R3 ships hide, merge and delete.
- Q: When does a user get the default categories — automatically, or chosen once ("Start with suggested categories" / "Start empty")? → A: Chosen once: the first time categories are needed, the user picks "Start with suggested categories" (preselected) or "Start empty".
- Q: Should expense and income categories be two separate lists, or one shared list usable for both directions? → A: Two separate lists, Expense and Income; a category's kind is fixed and sub-categories inherit it. Refunds are recorded as money coming in against the original expense category (R4).
- Q: Where should people's balances live — their own "People" entry in the main navigation, or inside Settings? → A: A new **People** entry in the main navigation, after Accounts, showing each person's balance and the two totals; Categories, Payees and Tags stay under Settings.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organise spending and income into nested categories (Priority: P1)

A signed-in user opens Categories and finds a ready-made set of expense and income categories suited
to an Indian household (Groceries, Rent, Electricity, School fees, Salary…). They add their own
categories and sub-categories at any depth, rename them, give them a colour and icon, and move a
category under a different parent.

**Why this priority**: Every transaction (R4), budget and report is grouped by category; reports roll
sub-categories up into their parents. Without categories nothing can be classified.

**Independent Test**: Asha (synthetic user) opens Categories, keeps "Start with suggested
categories", and sees the default Expense and Income trees. She adds "Kids" under Education, then "Swimming classes" under Kids, renames "Eating out" to
"Restaurants", and moves "Pets" from Family & social to the top level. Each change shows at once, and
"Swimming classes" is shown with its path "Education › Kids › Swimming classes".

**Acceptance Scenarios**:

1. **Given** a user who has never used categories, **When** they first open Categories or a category
   picker, **Then** they are asked once to choose "Start with suggested categories" (preselected) or
   "Start empty"; choosing the first adds the default categories in two trees, Expense and Income, each
   sorted alphabetically at every level.
2. **Given** a user who chose "Start empty", **When** they open Categories while they have no
   categories, **Then** they see the empty Expense and Income trees with "Add category" and an
   "Add suggested categories" option.
3. **Given** any category, **When** the user adds a sub-category under it, **Then** it appears under
   that parent, belongs to the same kind (expense or income), and can itself have sub-categories with
   no fixed depth limit.
4. **Given** a parent already has a sub-category "Fuel", **When** the user adds or renames another
   sub-category of the same parent to "fuel", **Then** it is refused (names are unique among
   siblings, ignoring letter case); a "Fuel" under a different parent is allowed.
5. **Given** a category, **When** the user moves it under another category of the same kind or to the
   top level, **Then** it moves with all its sub-categories; moving it under itself or one of its own
   sub-categories is not offered.
6. **Given** the user changes a category's name, colour or icon, **When** they save, **Then** every
   screen shows the new values, and the change history records the old and new values.
7. **Given** a long tree, **When** the user types part of a name in the category search or picker,
   **Then** matching categories are shown with their full path so same-named sub-categories can be
   told apart.

---

### User Story 2 - Keep payees, with a default category (Priority: P1)

The user keeps a list of the businesses they pay or are paid by ("Fresh Mart", "City Power Board",
"Acme Payroll"), each with an optional default category and notes. In R4, choosing a payee pre-fills
its default category.

**Why this priority**: Payees make entry fast and reports meaningful ("how much at Fresh Mart this
year"), and they are needed before transactions are recorded.

**Independent Test**: Asha adds the business payee "Fresh Mart" with default category
"Food & groceries › Groceries" and the note "Weekly vegetables", and "City Power Board" with default
"Utilities & bills › Electricity". Both appear in the payee list with their default category shown.

**Acceptance Scenarios**:

1. **Given** the payee form, **When** the user enters a name, chooses "Business" and optionally a
   default category and notes, and saves, **Then** the payee appears in the list at once.
2. **Given** a payee "Fresh Mart" exists, **When** the user adds "fresh mart", **Then** it is refused
   (payee names are unique ignoring letter case) and the existing payee is suggested.
3. **Given** a payee with a default category, **When** that category is renamed or moved, **Then** the
   payee shows the category's new name and path.
4. **Given** many payees, **When** the user types part of a name in the payee search, **Then** the
   list filters as they type.

---

### User Story 3 - Track what I owe people and what they owe me (Priority: P1)

Some payees are people — a sibling, a friend, a landlord. A person payee carries a running balance:
"Ravi owes you ₹15,000.00" or "You owe Meera ₹4,500.00". The user records each person's opening
balance as of a date; from R4 onwards, lending, borrowing, repaying and paying on their behalf move that
balance.

**Why this priority**: The owner tracks money owed to and by family members in a spreadsheet today;
person ledgers replace it and feed the payment plan (R7) and person statements (R6).

**Independent Test**: Asha adds the person "Ravi Kumar" with opening balance "Ravi owes me
₹15,000.00" as of 01-Apr-2026, and "Meera Iyer" with "I owe Meera ₹4,500.00". The People screen lists
Ravi "owes you ₹15,000.00" and Meera "you owe ₹4,500.00", with totals "People owe you ₹15,000.00" and
"You owe people ₹4,500.00". The People screen is one click away in the main navigation.

**Acceptance Scenarios**:

1. **Given** the payee form with "Person" chosen, **When** the user enters an opening balance, chooses
   its direction ("They owe me" or "I owe them") and a date, and saves, **Then** the person is listed
   with that balance and a label stating the direction in words (not colour alone).
2. **Given** a person with no opening balance, **When** they are listed, **Then** their balance shows
   ₹0.00 with "settled" and no direction.
3. **Given** several people, **When** the user opens **People** from the main navigation, **Then** it
   shows each person's balance and two totals — "People owe you" and "You owe people" — each exact to the paisa.
4. **Given** hide-balances is on (R1), **When** any payee or people screen is shown, **Then** every
   balance and total is masked.
5. **Given** an opening-balance date in the future, **When** the user saves, **Then** it is refused
   with an explanation.
6. **Given** Ravi owes Asha ₹15,000.00 and his "Include in net worth" switch is off (the default),
   **When** she turns it on, **Then** the Accounts screen's Owned and Net worth rise by ₹15,000.00 and
   the summary shows a "People" line so the figures still add up; turning it off reverses this.

---

### User Story 4 - Tag anything with free-form labels (Priority: P2)

The user keeps a list of tags ("Diwali 2026", "Goa trip", "Reimbursable") to label transactions across
categories (applied to transactions in R4). They can create, rename, merge and delete tags.

**Why this priority**: Tags answer questions categories cannot ("what did the Goa trip cost in
total?") but the app is usable without them.

**Independent Test**: Asha creates "Goa trip" and "Diwali 2026", renames "Goa trip" to "Goa trip 2026",
creates "Diwali", then merges "Diwali" into "Diwali 2026"; the tag list shows "Diwali 2026" and
"Goa trip 2026" only.

**Acceptance Scenarios**:

1. **Given** the tag list, **When** the user creates a tag, **Then** it appears in the list, sorted
   alphabetically; names are unique ignoring letter case.
2. **Given** two tags, **When** the user merges one into the other and confirms, **Then** every record
   labelled with the first is labelled with the second instead (a record never carries the same tag
   twice) and the first tag disappears.
3. **Given** a tag, **When** the user deletes it and confirms (the confirmation says how many records
   use it), **Then** it is removed from the list and from every record that used it.

---

### User Story 5 - Clean up: hide, merge and delete categories and payees (Priority: P2)

Over time lists collect duplicates and things no longer used. The user hides categories and payees so
they are no longer offered for new entries (while past records keep them), merges a duplicate into the
one to keep, and deletes entries created by mistake.

**Why this priority**: Keeps pickers short and reports clean over years of use, and lets the user trim
the default categories to their household; not needed on day one.

**Independent Test**: Asha hides "Education › Tuition & classes"; it no longer appears in the category
picker but stays visible (marked hidden) on the Categories screen. She creates a duplicate payee
"FreshMart", sets it as nothing's default, and merges it into "Fresh Mart"; only "Fresh Mart" remains.
She deletes the never-used category "Pets".

**Acceptance Scenarios**:

1. **Given** a category, **When** the user hides it, **Then** it and all its sub-categories are no
   longer offered when choosing a category for new entries, but stay listed (marked "hidden") on the
   Categories screen and on existing records; unhiding restores them.
2. **Given** a payee, **When** the user hides it, **Then** it is no longer offered when choosing a
   payee for new entries but remains on existing records and in a "Hidden" filter of the payee list. A
   hidden person still counts in the People totals while their balance is not ₹0.00.
3. **Given** two categories of the same kind, **When** the user merges one into the other and
   confirms, **Then** everything that used the first category (payee defaults now; transactions and
   budgets in later modules) uses the second, the first category's sub-categories move under the
   second (a sub-category whose name already exists there is merged into it), and the first category
   disappears.
4. **Given** two payees of the same kind, **When** the user merges one into the other and confirms,
   **Then** everything that used the first payee uses the second, the second keeps its own name,
   default category and notes (the first payee's notes are appended), and for two people the first
   person's opening balance is added to the second's.
5. **Given** a category or payee that nothing has ever been recorded against (R4 transactions) and, for
   a category, that has no sub-categories, **When** the user deletes it and confirms, **Then** it
   disappears from every screen; payees that had it as their default category lose that default and
   the confirmation says how many. Otherwise delete is not offered and the app suggests hiding or
   merging instead.
6. **Given** the user merges or deletes, **When** the change history is inspected, **Then** it records
   the action, who, when and what moved where.

---

### User Story 6 - Manage categories, tags and payees offline on Android (Priority: P3, Android phase)

On the Android app the user can add, edit, move and hide categories, tags and payees with no signal;
changes sync automatically when the phone is back online, exactly as accounts do in R2.

**Why this priority**: Offline entry is a core promise (constitution IV), but the owner chose to
build the web app first; this story is delivered in the Android phase on the foundations laid here.

**Independent Test**: In airplane mode Asha adds the payee "Corner Bakery" and the category
"Food & groceries › Bakery"; both show as waiting. She reconnects; within a minute both appear on the
web with no duplicates.

**Acceptance Scenarios**:

1. **Given** the phone is offline, **When** the user creates, edits, moves or hides a category, tag or
   payee, **Then** the change is saved on the phone at once and sent automatically when connectivity
   returns, exactly once.
2. **Given** two devices created a payee, tag or sibling category with the same name while offline,
   **When** both have synced, **Then** both are kept and the one synced second is renamed with a
   " (2)" suffix, and the user is told.
3. **Given** the same record was edited on two devices before syncing, **When** both have synced,
   **Then** the R2 rule applies: per field, the latest edit wins, and overwritten values stay in the
   change history.

---

### Edge Cases

- The default categories are added at most once per user. They never appear twice, even if the user
  makes the start choice on several devices or browsers at the same moment, and deleting or renaming a
  default never brings it back. If two devices answer the start choice differently, the first answer to
  reach the service counts.
- Moving a category whose name already exists among the new parent's sub-categories is refused, with
  a suggestion to merge instead.
- A hidden parent hides its whole subtree from pickers; an unhidden sub-category under a hidden parent
  stays hidden from pickers until the parent is unhidden, and the Categories screen explains why.
- Merging a category into one of its own sub-categories, or a payee into itself, is not offered.
- Merging a business into a person (or the reverse) is not offered; the user changes the kind first.
- Changing a person to a business is allowed only while the person's balance is ₹0.00; changing a
  business to a person starts the person at ₹0.00 "settled".
- A person balance of exactly ₹0.00 shows "settled"; very large balances (up to ±₹9,99,99,99,999.99)
  are stored, totalled and displayed exactly; larger values are refused.
- Amounts follow R2's single amount-entry rule (₹ and separators accepted; more than two decimals
  refused, never silently rounded).
- A category used as a payee's default can be hidden; the payee keeps it as its default, shown
  marked "hidden".
- Two browser tabs editing the same record: per field, the later save wins (as R2).
- A user disabled while editing (R1): the save is refused and they are signed out; nothing partial
  is stored.
- Erasing a user (R1) erases their categories, tags, payees and their change history.
- The owner-admin's user management never shows another user's categories, tags, payees, people or
  balances, or how many they have.

## Requirements *(mandatory)*

### Functional Requirements

**Categories**

- **FR-001**: Every category MUST be either an expense or an income category. The Categories screen
  MUST show two trees, Expense and Income; a sub-category always has its parent's kind, and a
  category's kind cannot be changed.
- **FR-002**: Users MUST be able to create categories at the top level or under any category, with no
  fixed depth limit. Category names MUST be 1–40 characters after trimming, unique among siblings
  (same parent, or both at the top level of the same kind), ignoring letter case.
- **FR-003**: Each category MUST have a colour and an icon, chosen from the same palette and icon set as
  accounts (R2); a new sub-category takes its parent's colour and icon unless the user picks others.
- **FR-004**: Categories MUST be listed alphabetically (ignoring letter case) at every level; there is
  no manual ordering.
- **FR-005**: Wherever a category is shown outside its tree it MUST be identified by its full path
  (e.g., "Education › Kids › Swimming classes"), and every category picker MUST support searching by
  any part of the name.
- **FR-006**: Users MUST be able to rename a category, change its colour and icon, and move it (with
  its whole subtree) under another category of the same kind or to the top level of its kind. A move
  that would place a category under itself or its own sub-category, or next to a sibling with the
  same name, MUST be refused.
- **FR-007**: The first time a user needs categories (opening Categories or any category picker), they
  MUST be asked once to choose **Start with suggested categories** (preselected) — which adds the set in
  [Default categories](#default-categories) — or **Start empty**. While a user has no categories, the
  Categories screen MUST also offer "Add suggested categories". Once added, defaults are ordinary
  categories the user may rename, move, hide, merge or delete, and they are never re-added
  automatically.
- **FR-008**: A user MUST be able to have up to 500 categories (not counting deleted ones); the form
  explains the limit when it is reached.

**Tags**

- **FR-009**: Users MUST be able to create, rename, merge and delete tags. Tag names MUST be 1–30
  characters after trimming, unique per user ignoring letter case, and listed alphabetically.
- **FR-010**: Deleting a tag MUST require confirmation stating how many records use it, and removes it
  from those records. Merging tag A into tag B relabels every record carrying A with B (never twice)
  and removes A.
- **FR-011**: A user MUST be able to have up to 500 tags.

**Payees**

- **FR-012**: Users MUST be able to create a payee with a name, a kind (Business or Person), an
  optional default category (any category of either kind) and optional notes (up to 500 characters).
  Payee names MUST be 1–60 characters after trimming and unique among the user's payees that are not
  deleted (including hidden ones), ignoring letter case.
- **FR-013**: The payee list MUST be searchable by any part of the name as the user types, and filterable
  by kind (All, Businesses, People) and by hidden state.
- **FR-014**: Users MUST be able to edit a payee's name, kind, default category and notes (and, for a
  person, the opening balance, its direction and date, and the net-worth switch). Changing a
  person to a business MUST be refused unless the person's balance is ₹0.00.
- **FR-015**: A user MUST be able to have up to 2,000 payees.

**People (person payees)**

- **FR-016**: A person MUST have an opening balance with a direction — "They owe me" or "I owe them" —
  and an opening-balance date (default today in the user's timezone; not in the future). An opening
  balance of ₹0.00 has no direction. Amounts follow R2's rules: exact paise in the base currency,
  at most two decimals, within ±₹9,99,99,99,999.99, never rounded.
- **FR-017**: A person's current balance MUST equal their opening balance plus the effect of every
  person-ledger movement recorded on or after the opening-balance date (R4). Until R4 it equals the
  opening balance. It MUST be exact and recomputable on demand.
- **FR-018**: A person's balance MUST be shown with words stating the direction — "owes you ₹X",
  "you owe ₹X" or "settled" — never by sign or colour alone.
- **FR-019**: The People screen MUST show two totals: **People owe you** (sum of balances where the person
  owes the user) and **You owe people** (sum where the user owes the person), each exact to the paisa,
  including hidden people with a non-zero balance. These figures MUST be identical on every screen that
  shows them (later the R7 payment plan's "money owed to / by people" panel).
- **FR-020**: Each person MUST have an "Include in net worth" switch, off by default. When it is on,
  the person's balance counts in the Accounts screen's summary (R2): money they owe the user adds to
  Owned, money the user owes them adds to Owed, and Net worth changes accordingly. The summary MUST then
  show a "People" line (owed to you and owed by you, for included people only) so Owned, Owed and Net
  worth still add up from the lines shown. People with the switch off never affect these figures. The
  People totals (FR-019) always include every person, whatever the switch.
- **FR-021**: Every amount on payee and people screens MUST respect hide-balances mode (R1).
- **FR-034**: The main navigation MUST gain a **People** entry directly after Accounts, on every width
  (the phone drawer included). The People screen lists every person (hidden people in a separate,
  collapsible section) with their balance and direction, the two People totals (FR-019) at the top, and
  "Add person". Categories, Payees and Tags MUST be reachable from Settings.

**Hide, merge, delete**

- **FR-022**: Users MUST be able to hide and unhide categories and payees. A hidden category (and every
  category beneath it) and a hidden payee MUST NOT be offered when choosing a category or payee for new
  entries, but MUST remain on records that already use them and stay listed, marked "hidden", on the
  management screens.
- **FR-023**: Users MUST be able to merge a category into another category of the same kind that is not
  its own sub-category. After confirmation, every reference to the source (payee default categories in
  this module; transactions, split lines and later budgets in their modules) MUST point to the target;
  the source's sub-categories MUST move under the target, and a moved sub-category whose name matches an
  existing sub-category of the target MUST be merged into it by the same rule; the source is then
  deleted. The confirmation MUST say what will move.
- **FR-024**: Users MUST be able to merge a payee into another payee of the same kind. After
  confirmation, every reference to the source MUST point to the target; the target keeps its name,
  kind and default category; the source's notes are appended to the target's; when both are people
  the source's opening balance is added to the target's (the target's opening-balance date becomes the
  earlier of the two) so the combined balance is exact, and the target keeps its own net-worth switch;
  the source is then deleted.
- **FR-025**: Users MUST be able to delete a category only if it has no sub-categories and nothing has
  ever been recorded against it, and a payee only if nothing has ever been recorded against it
  (transactions arrive in R4). Deleting requires confirmation; for a category the confirmation says how
  many payees will lose it as their default. Deleted records disappear from every screen and are kept
  in the change history (soft deletion).
- **FR-026**: Relocate — moving every record from one category or payee to another while keeping the
  source — is out of scope for this module and is delivered in R4 with transactions (owner's choice
  2026-10-27); here the only references are payee default categories, which merge already covers.

**Privacy and history**

- **FR-027**: A user's categories, tags, payees, people and balances, and their change history, MUST be
  visible to and changeable by that user only; other users, including the owner-admin, MUST NOT be able
  to read or change them by any route.
- **FR-028**: Every create, edit, move, hide, unhide, merge and delete of a category, tag or payee MUST
  be recorded in the append-only change history with who, when, from which device type, and the values
  before and after (for merges: source, target and what moved).
- **FR-029**: Operational logs MUST NOT contain category, tag or payee names, notes or person balances.
- **FR-030**: Erasing a user (R1) MUST erase all of their categories, tags, payees and the change history
  of those records.

**Offline and sync (Android phase)**

- **FR-031**: On Android, users MUST be able to create, edit, move, hide and unhide categories, tags and
  payees without connectivity, with the same sync guarantees as accounts in R2: each change applied
  exactly once, per-field latest-edit-wins, overwritten values recoverable from the history.
- **FR-032**: When records created offline on different devices end up with the same name (payees,
  tags, or sibling categories), both MUST be kept and the one synced second renamed with the next free
  " (n)" suffix; the user is told on the device where it was created.
- **FR-033**: Merges and deletes made on Android MUST be checked by the service when they arrive; one
  that is no longer allowed (e.g., the record has since been used) is not applied and the user is told.

### Default categories

Added when the user chooses "Start with suggested categories" or "Add suggested categories" (FR-007).
Expense tree:

| Category | Sub-categories |
|----------|----------------|
| Food & groceries | Groceries, Vegetables & fruits, Milk & dairy, Eating out, Food delivery |
| Home | Rent, Maintenance & society charges, Repairs, Furnishing, Domestic help |
| Utilities & bills | Electricity, Water, Cooking gas, Mobile, Internet & broadband, DTH & streaming |
| Transport | Fuel, Cab & auto, Public transport, Vehicle service, Tolls & parking |
| Health | Doctor & hospital, Medicines, Tests & diagnostics |
| Education | School & college fees, Tuition & classes, Books & supplies |
| Shopping | Clothing & footwear, Electronics, Household items, Personal care |
| Family & social | Gifts given, Festivals & celebrations, Donations, Pets |
| Entertainment | Movies & events, Hobbies, Subscriptions |
| Travel | Tickets, Stays, Holiday spending |
| Insurance | Life insurance, Health insurance, Vehicle insurance |
| Taxes & charges | Income tax, Property tax, Bank charges, Fines & penalties |
| Interest paid | Loan interest, Card interest & fees |
| Miscellaneous | — |

Income tree:

| Category | Sub-categories |
|----------|----------------|
| Salary | Salary, Bonus |
| Business & freelance | — |
| Interest received | — |
| Dividends | — |
| Rent received | — |
| Gifts received | — |
| Refunds & cashback | — |
| Other income | — |

### Key Entities

- **Category**: a label for spending or income. Attributes: name, kind (expense or income), parent
  category (optional), colour, icon, hidden flag, state (active, deleted), owner. Shown with its full
  path; sorted alphabetically among siblings.
- **Tag**: a free-form label. Attributes: name, state (active, deleted), owner.
- **Payee**: a business or person the user pays or is paid by. Attributes: name, kind (business or
  person), default category (optional), notes, hidden flag, state (active, deleted), owner.
- **Person ledger** (for a person payee): opening balance (exact, in base currency) with direction and
  date; include-in-net-worth switch (off by default); current balance derived (FR-017).
- **People totals**: derived — "People owe you" and "You owe people".
- **Change record**: one entry in the append-only history per create, edit, move, hide, unhide, merge
  or delete: who, when, device type, action and the values before and after.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can add a sub-category or a payee with a default category in under 30 seconds.
- **SC-002**: With 500 categories and 2,000 payees, typing part of a name in a category picker or the
  payee search shows matches within 1 second, and the payee list and Categories screen open within
  2 seconds.
- **SC-003**: Across a test set covering nested merges with clashing sub-category names, payee merges
  and deletes, 100% of references end up on the expected record, and no category, payee or reference is
  lost or duplicated.
- **SC-004**: Across a test set covering zero, both directions, merged people, people included in and
  left out of net worth, and maximum-size balances, 100% of person balances, the two People totals and
  the Accounts screen's Owned, Owed and Net worth match hand-computed values exactly to the paisa.
- **SC-005**: Automated isolation tests show 0 cases in which a user — including the owner-admin — can
  read or change another user's categories, tags, payees or their change history.
- **SC-006**: 100% of changes made during acceptance testing appear in the change history with correct
  before/after values, and none appears in operational logs with names, notes or amounts.
- **SC-007**: With hide-balances on, a review of every payee and people screen finds 0 unmasked amounts.
- **SC-008**: Every user who chooses the suggested categories has exactly one copy of them, including
  when the choice is made on two browsers at the same moment; a user who chooses "Start empty" has none.
- **SC-009** (Android phase): 20 changes to categories, tags and payees made offline across two devices,
  including conflicting edits and duplicate names, sync with 0 lost changes, 0 duplicates and identical
  lists on both devices within 1 minute of reconnecting.

## Assumptions

- **Delivery order**: web first (owner, 2026-10-24). Stories 1–5 are built for the web here; Story 6
  and the Android screens come in the Android phase, using the sync chosen in R2, so these records are
  shaped to sync without rework.
- **Navigation** (owner, 2026-10-27): a new **People** entry joins the main navigation after Accounts
  (FR-034); Categories, Payees and Tags are reached from Settings, and R4 also opens them from the
  transaction form.
- **Kinds**: expense and income categories are separate trees, as in MS Money and Quicken (owner,
  2026-10-27); a refund is money coming in against the original expense category, reducing spending
  (R4); transfers (R4) use no category; reimbursement tracking is Phase 2b.
- **Ordering** is alphabetical rather than manual: lists of categories and payees are long and
  alphabetical order is what pickers need.
- **Relocate** (FR-026) moved to R4 (owner, 2026-10-27), since it only matters once transactions
  exist; merge covers the clean-up needed now.
- **Person ledger scope**: movements (lend, borrow, repay, paid / collected on behalf of), interest and
  rate history arrive in R4; person statements and the per-person sign-direction setting in R6; the
  payment-plan people panel in R7. This module defines the person, the opening balance and the derived
  balance.
- **Net worth** stays account-only unless the user switches a person in (FR-020, owner's choice
  2026-10-27); every person always appears in the People totals.
- **Statement match patterns** for payees (SCOPE D10) belong to statement import (Phase 2a).
- Merging and deleting are checked by the service; on Android they are applied when they sync (FR-033).
- Viewing the change history in the app is Phase 4 (undo UI); the history is captured from the start.
- **Demo data**: this module extends the fixed synthetic demo set with custom and hidden categories,
  tags, businesses and people with balances in both directions and settled; "Load demo data" arrives in
  R5.
- Examples use synthetic names, `example.com` emails and made-up amounts only.
