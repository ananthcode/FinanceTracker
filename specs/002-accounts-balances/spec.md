# Feature Specification: Accounts & Balances

**Feature Branch**: `002-accounts-balances`

**Created**: 2026-10-24

**Status**: Approved (2026-10-24)

**Input**: User description: "Roadmap capability R2 (ROADMAP.md) — Accounts & balances: create, edit and archive accounts (bank, cash, credit card, wallet) with opening balance, grouping, colour/icon/order; live balances and net-worth summary; first data synced offline-first. Web is built first; Android screens follow in the Android phase."

## Clarifications

### Session 2026-10-24

- Q: When an account still has money in it (or an amount owed), may it be archived, and does its balance still count in net worth? → A: No — an account can be archived only when its balance is exactly ₹0.00, so archiving never changes net worth.
- Q: Should accounts always be grouped by type, or can users make their own groups? → A: Both — accounts are grouped by type by default, and the user can switch the accounts screen to their own groups (e.g., "My accounts", "Held for family"), each holding any mix of types with its own subtotal.
- Q: When the same account is changed on two devices before they sync, which change wins? → A: Per field, latest edit wins — changes to different fields are combined; for the same field the edit made last wins, and the overwritten value stays in the change history.
- Q: When the app is open on two devices, should a change on one appear on the other by itself? → A: No — the device where the change is made updates instantly; other devices show it the next time the accounts screen is opened or refreshed (Android: after sync).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add accounts with opening balances (Priority: P1)

A signed-in user records the places their money lives — a bank account, cash in hand, a credit
card, a mobile wallet — each with the balance it had on a chosen date. The accounts appear in a
list grouped by kind, each showing its current balance.

**Why this priority**: Every later module (transactions, payment plan, reports) records money
against an account. Without accounts nothing else can be entered.

**Independent Test**: Asha (synthetic user) creates "Everyday Savings" (bank, ₹52,340.50 as of
01-Apr-2026), "Cash in hand" (cash, ₹2,000.00) and "Rewards Card" (credit card, ₹18,250.00 owed);
the accounts list shows all three under Bank accounts, Cash and Credit cards with those balances.

**Acceptance Scenarios**:

1. **Given** a signed-in user with no accounts, **When** they open Accounts, **Then** they see an
   empty state that explains what an account is and offers "Add account".
2. **Given** the add-account form, **When** the user enters a name, picks a type, enters an opening
   balance and an opening-balance date and saves, **Then** the account appears in its type's group
   with that balance, without reloading the page.
3. **Given** the user adds a credit card with ₹18,250.00 owed, **When** the list is shown, **Then**
   the card shows "₹18,250.00 owed" (a label, not colour alone) and is counted as a liability.
4. **Given** the user enters an opening-balance date in the future, **When** they save, **Then**
   the form refuses it and explains that the date must be today or earlier.
5. **Given** the user already has an account named "Everyday Savings", **When** they add another
   account named "everyday savings", **Then** the form refuses it and explains that names must be
   unique (letter case is ignored).
6. **Given** amounts are entered, **When** the account is saved and shown, **Then** the amount is
   stored and displayed exactly to the paisa in the user's number format (e.g., ₹52,340.50 in
   Indian grouping).

---

### User Story 2 - See balances and net worth at a glance (Priority: P1)

The accounts screen shows, for the user's active accounts, a summary of what they own (bank,
cash and wallet balances), what they owe (credit-card balances) and their net worth (owned minus
owed), with a subtotal for each group.

**Why this priority**: Knowing "where do I stand" is the first value the app gives back; it also
proves balances are exact before transactions arrive in R4.

**Independent Test**: With the three accounts from Story 1, the summary shows Owned ₹54,340.50,
Owed ₹18,250.00 and Net worth ₹36,090.50; group subtotals match each group's accounts exactly.

**Acceptance Scenarios**:

1. **Given** active accounts of several types, **When** the user opens Accounts, **Then** the
   summary shows Owned, Owed and Net worth, and each group shows its subtotal; all figures add up
   exactly to the paisa.
2. **Given** a bank account with a negative balance (overdrawn), **When** totals are calculated,
   **Then** it reduces Owned (it is not moved into Owed) and is shown with a minus sign and an
   "overdrawn" label.
3. **Given** a credit card that has been overpaid (a credit balance), **When** totals are
   calculated, **Then** it reduces Owed and is labelled "in credit".
4. **Given** an account marked "Don't include in net worth", **When** totals are calculated,
   **Then** its balance still shows on its own row but is left out of the group subtotal, Owned,
   Owed and Net worth, and the row says it is excluded.
5. **Given** hide-balances is on (R1), **When** the accounts screen is shown, **Then** every
   balance, subtotal and total is masked.
6. **Given** net worth is negative, **When** it is shown, **Then** it carries a minus sign and a
   label (not colour alone).

---

### User Story 3 - Edit and personalise accounts (Priority: P2)

The user renames accounts, corrects an opening balance or its date, chooses a colour and an icon,
arranges the order in which accounts appear, and can organise accounts into groups of their own as
an alternative to the default grouping by type.

**Why this priority**: Makes the list recognisable at a glance and lets mistakes be fixed, but the
app is usable without it.

**Independent Test**: Asha renames "Cash in hand" to "Wallet cash", gives it a green colour and a
coins icon, moves it above another cash account and corrects its opening balance from ₹2,000.00 to
₹2,500.00; the list, subtotal and net worth update at once and the change history records each
change with the old and new values.

**Acceptance Scenarios**:

1. **Given** an account, **When** the user changes its name, colour, icon, notes or opening
   balance/date and saves, **Then** the list, subtotals and net worth reflect the change
   immediately.
2. **Given** several accounts in a group, **When** the user moves one up or down (by drag and drop
   or with Move up / Move down controls that work from the keyboard), **Then** the new order is
   kept on every device the user signs in on.
3. **Given** a new account is created, **When** no colour or icon is chosen, **Then** a default
   colour and an icon suited to its type are used.
4. **Given** the user changes an account's type between an owned type (bank, cash, wallet) and an
   owed type (credit card), **When** they save, **Then** they are first told how this changes Owned,
   Owed and Net worth and must confirm.
5. **Given** any edit is saved, **When** the change history is inspected, **Then** it holds who
   made the change, when, and the values before and after.
6. **Given** the user creates groups "My accounts" and "Held for family" and puts accounts into
   them, **When** they switch the accounts screen from "By type" to "My groups", **Then** accounts
   appear under their own groups (accounts in no group under "Ungrouped"), each group shows its
   subtotal, and Owned, Owed and Net worth are unchanged.
7. **Given** the user deletes the group "Held for family", **When** they confirm, **Then** its
   accounts move to "Ungrouped" and no account or balance changes.

---

### User Story 4 - Archive, restore and delete accounts (Priority: P2)

The user archives accounts they no longer use (a closed bank account, an old wallet) so they
disappear from everyday lists while their history is kept, restores an archived account if needed,
and deletes an account created by mistake.

**Why this priority**: Keeps everyday lists clean over years of use; needed before real history
exists, but not for first use.

**Independent Test**: Asha archives "Old Wallet" (balance ₹0.00); it leaves the main list and
appears under "Archived accounts"; she restores it and it returns to its group in its previous
position. She deletes "Test account" (never used) and it disappears from every screen.

**Acceptance Scenarios**:

1. **Given** an active account with a balance of ₹0.00, **When** the user archives it, **Then** it
   moves to an "Archived accounts" section, is no longer offered where accounts are chosen (e.g.,
   when recording a transaction in R4), and Owned, Owed and Net worth do not change.
2. **Given** an account whose balance is not ₹0.00 (e.g., ₹350.00 in a wallet or ₹1,200.00 owed on
   a card), **When** the user tries to archive it, **Then** archiving is refused with the current
   balance and an explanation that it must be ₹0.00 first (settle it, or correct the opening
   balance).
3. **Given** an archived account, **When** the user restores it, **Then** it returns to its group
   at its previous position and counts in totals again.
4. **Given** an account that has never had a transaction recorded against it, **When** the user
   deletes it and confirms, **Then** it disappears from every screen; its record is kept only in the
   change history.
5. **Given** an account that has (or has ever had) transactions, **When** the user looks for
   Delete, **Then** delete is not offered and the app explains that the account can be archived
   instead.
6. **Given** an archived account named "Old Wallet", **When** the user tries to create a new
   account with the same name, **Then** the form refuses it and suggests restoring the archived
   account or choosing another name.

---

### User Story 5 - Manage accounts offline on Android (Priority: P3, Android phase)

On the Android app the user can add, edit, reorder, archive and restore accounts with no signal.
Changes are kept on the phone, shown as waiting to be sent, and sent automatically when the phone is
back online; the same accounts then appear on the web and on the user's other devices.

**Why this priority**: Offline entry is a core promise of the Android app (constitution IV) and
accounts are the first data to sync, but the owner chose to build the web app first (2026-10-24);
this story is delivered in the Android phase on the foundations laid in this module.

**Independent Test**: With the phone in airplane mode, Asha adds "Petrol cash" and renames
"Rewards Card" to "Travel Card"; both show as waiting to be sent. She turns airplane mode off; within
a minute both changes appear on the web, with no duplicates, and the waiting indicator clears.

**Acceptance Scenarios**:

1. **Given** the phone is offline, **When** the user adds or edits an account, **Then** the change
   is saved on the phone at once, the balances and net worth on the phone update, and the change is
   marked as waiting to be sent.
2. **Given** changes are waiting, **When** connectivity returns, **Then** they are sent
   automatically, each exactly once, even if the connection drops and the send is retried.
3. **Given** the same account was edited on two devices while one was offline, **When** both have
   synced, **Then** both devices show the same result according to the conflict rule (FR-030), and
   any value that was overwritten can still be found in the change history.
4. **Given** two devices each created an account with the same name while offline, **When** both
   have synced, **Then** both accounts are kept, the one synced second is renamed with a " (2)"
   suffix, and the user is told.
5. **Given** the user signs out with account changes still waiting, **When** they confirm, **Then**
   the R1 unsent-changes warning applies to these changes.

---

### Edge Cases

- A balance of exactly ₹0.00 shows as ₹0.00 with no "owed", "overdrawn" or "in credit" label.
- Very large balances (e.g., ₹9,99,99,99,999.99) are stored, totalled and displayed exactly with
  lakh/crore grouping; values beyond the allowed range are refused with an explanation.
- Amounts typed with more than two decimal places, with thousands separators or with a leading ₹
  are handled by the amount field's single documented rule (separators and ₹ accepted; more than
  two decimals refused, never silently rounded).
- A user with only excluded or archived accounts sees Net worth ₹0.00 and an explanation of why.
- Archiving the last active account returns the screen to the empty state, with a link to the
  archived accounts.
- An archived account keeps its user group; it is listed under "Archived accounts" in both views
  and returns to that group when restored. Deleting a group that holds archived accounts moves them
  to "Ungrouped" as well.
- Renaming an account to the name of another account (active or archived, any letter case) is
  refused.
- Two browser tabs editing the same account: each save changes only the fields edited in that tab;
  for a field edited in both, the later save wins. The first tab shows the combined result next time
  the list refreshes, and both versions remain in the change history.
- A user is disabled (R1) while editing accounts: the save is refused and they are signed out; no
  partial change is stored.
- A user is erased (R1): all their accounts and the accounts' history are erased with them, as with
  all of that user's data.
- The base currency is fixed at setup (R1), so every account uses it; a different currency cannot
  be chosen in Phase 1.
- The owner-admin's user management (R1) never shows account names, balances or counts.

## Requirements *(mandatory)*

### Functional Requirements

**Creating accounts**

- **FR-001**: Users MUST be able to create an account with a name, a type (Bank account, Cash,
  Credit card or Wallet), an opening balance and an opening-balance date.
- **FR-002**: Account names MUST be 1–40 characters after trimming leading and trailing spaces, and
  unique among the user's accounts that are not deleted (active and archived), ignoring letter case.
- **FR-003**: Opening balances MUST be exact amounts in the user's base currency with at most two
  decimal places, within ±₹9,99,99,99,999.99, and MUST be stored without any rounding.
- **FR-004**: The opening-balance date MUST default to today (in the user's timezone) and MUST NOT
  be in the future.
- **FR-005**: For bank, cash and wallet accounts the opening balance is what the account holds
  (negative means overdrawn); for credit cards it is the amount owed (negative means in credit).
  The form MUST say which meaning applies to the chosen type.
- **FR-006**: Users MAY add notes (up to 500 characters) to any account, and an optional credit
  limit to a credit card; when a limit is set the card also shows its available credit (limit minus
  amount owed).
- **FR-007**: Every account MUST use the user's base currency; choosing another currency is out of
  scope for Phase 1.

**Personalising and arranging**

- **FR-008**: Each account MUST have a colour (chosen from a fixed palette of at least 12 colours)
  and an icon (chosen from a built-in set); defaults depend on the type when the user picks none.
- **FR-009**: The accounts screen MUST offer two views: **By type** (the default) — one group per
  account type in the order Bank accounts, Cash, Wallets, Credit cards — and **My groups** — the
  user's own groups in the order the user sets, followed by "Ungrouped". The chosen view MUST be
  remembered for the user on every device.
- **FR-009a**: Users MUST be able to create, rename, reorder and delete their own groups. Group
  names are 1–30 characters, unique per user ignoring letter case; a user may have up to 30 groups.
  Each account belongs to at most one of the user's groups (or none); an account's type group is
  always its type.
- **FR-009b**: Deleting a user group MUST require confirmation and move its accounts to
  "Ungrouped"; it never deletes, archives or changes accounts or balances.
- **FR-010**: The user MUST be able to set the order of accounts. One order is kept per user: each
  group, in either view, lists its accounts in that order, and moving an account in either view
  updates it. New accounts go to the end. Reordering accounts and groups MUST be possible both by
  drag and drop and by keyboard-operable Move up / Move down controls, and the order MUST follow the
  user to every device.
- **FR-011**: Users MUST be able to edit an account's name, type, opening balance, opening-balance
  date, colour, icon, notes, credit limit, user group and net-worth inclusion; a change of type between owned
  and owed kinds MUST require confirmation after explaining its effect on the totals.

**Balances**

- **FR-012**: An account's current balance MUST equal its opening balance plus the effect of every
  transaction recorded against it on or after the opening-balance date. Until transactions exist
  (R4), the current balance equals the opening balance.
- **FR-013**: Balances MUST be computed exactly in whole paise and MUST be recomputable on demand
  from the opening balance and the transaction history; any stored or cached balance MUST agree
  with that recomputation.
- **FR-014**: After any change the user makes on a device, that device MUST show updated balances,
  subtotals and net worth without a manual reload; the user's other devices MUST show them the next
  time accounts are shown or refreshed (and, on Android, after sync).
- **FR-015**: Balances MUST be displayed in the user's number format with a sign and, where the
  meaning is not obvious, a label: "owed" for a credit-card balance, "in credit" for an overpaid
  card, "overdrawn" for a negative bank, cash or wallet balance. Colour MAY be used in addition but
  never alone.

**Net-worth summary**

- **FR-016**: The accounts screen MUST show a summary with Owned (sum of included bank, cash and
  wallet balances), Owed (sum of included credit-card balances) and Net worth (Owned − Owed).
- **FR-017**: Each group, in either view, MUST show a subtotal of its included accounts: owned
  balances minus owed balances when a user group mixes both kinds, labelled as such. Switching views
  MUST NOT change Owned, Owed or Net worth.
- **FR-018**: Each account MUST have an "Include in net worth" setting, on by default; an excluded
  account still shows its own balance, is marked as excluded, and is left out of its group subtotal,
  Owned, Owed and Net worth.
- **FR-019**: Owned, Owed and Net worth MUST be identical, to the paisa, on every screen and
  platform that shows them (later including the R6 dashboard and the R7 payment plan).
- **FR-020**: Every amount on the accounts screens MUST respect hide-balances mode (R1).

**Archiving, restoring and deleting**

- **FR-021**: Users MUST be able to archive an active account and restore an archived one; archived
  accounts are listed in a separate "Archived accounts" section and are not offered where an
  account is chosen for new records.
- **FR-022**: An account MUST be archivable only when its current balance is exactly ₹0.00, so
  archiving never changes Owned, Owed or Net worth; otherwise archiving is refused, showing the
  balance and how to bring it to ₹0.00. If an archived account's balance later stops being ₹0.00
  (e.g., an older transaction is edited in R4), it MUST count in the totals again and be flagged
  "archived with a balance" until the user settles or restores it. On Android, an archive made
  offline that turns out not to meet this rule when synced is not applied, and the user is told.
- **FR-023**: A restored account MUST return to its group at its previous position.
- **FR-024**: Users MUST be able to delete an account only if no transaction has ever been recorded
  against it; deletion requires confirmation, removes the account from every screen, and keeps it in
  the change history (soft deletion). Accounts with transaction history can only be archived.
- **FR-025**: A user MUST be able to have up to 200 accounts (active and archived together); the
  form explains the limit when it is reached.

**Privacy and history**

- **FR-026**: A user's accounts, balances and change history MUST be visible to and changeable by
  that user only; other users, including the owner-admin, MUST NOT be able to read or change them by
  any route (R1 isolation rules extend to accounts).
- **FR-027**: Every create, edit, reorder, archive, restore and delete of an account, and every
  create, rename, reorder and delete of a user group, MUST be recorded in an append-only change
  history with who, when, from which device type, and the values
  before and after.
- **FR-028**: Operational logs MUST NOT contain account names, notes, balances or credit limits.
- **FR-029**: Erasing a user (R1) MUST erase all of their accounts and their change history along with
  the rest of their data.

**Offline and sync (Android phase)**

- **FR-030**: On Android, users MUST be able to create, edit, reorder, archive and restore accounts,
  and manage their own groups, without connectivity; each change is saved on the phone immediately and sent automatically when
  connectivity returns. When the same account is changed on two devices before syncing, changes to
  different fields are combined, and a field changed on both takes the value from the change made
  last (by the time it was made on the device); a field
  overwritten this way remains recoverable from the change history. An archive or delete wins over
  an edit made elsewhere; the edit remains in the history.
- **FR-031**: Sending a change MUST be idempotent: a change delivered more than once (retries, poor
  connections) is applied exactly once, and no change is silently lost.
- **FR-032**: When accounts created offline on different devices end up with the same name, both
  MUST be kept; the one synced second is renamed with the next free " (n)" suffix and the user is
  told on the device where it was created.
- **FR-033**: The Android app MUST show how many account changes are waiting to be sent; the R1
  sign-out warning about unsent changes MUST include them.
- **FR-034**: Deleting an account offline MUST follow FR-024 using the transaction history known to
  the phone; if the server knows of transactions the phone did not, the delete is turned into an
  archive and the user is told.

### Key Entities

- **Account**: a place where the user's money is held or owed. Attributes: name, type (bank, cash,
  credit card, wallet), opening balance (exact, in base currency) and its date, colour, icon,
  position in the user's account order, user group (optional), include-in-net-worth flag, notes, optional credit limit (credit cards),
  state (active, archived, deleted), owner (one user). Its current balance is derived (FR-012).
- **Type group**: the fixed grouping by account type used in the "By type" view; not stored per
  user.
- **User group**: a group the user creates for the "My groups" view. Attributes: name, position,
  state (active, deleted), owner (one user). An account belongs to at most one user group.
- **Net-worth summary**: derived figures — per-group subtotals, Owned, Owed, Net worth — computed
  from the user's included, active accounts.
- **Account change record**: one entry in the append-only history for an account: who, when, device
  type, action (created, edited, reordered, archived, restored, deleted, sync-renamed) and the values
  before and after.
- **Pending change (Android)**: an account change saved on the phone that has not yet been accepted
  by the service; identified uniquely so it is applied once.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can add their first account with an opening balance in under 1 minute, and
  each further account in under 30 seconds.
- **SC-002**: Across a test set covering zero, negative, overdrawn, in-credit, excluded, archived
  and maximum-size balances, 100% of balances, subtotals, Owned, Owed and Net worth figures match
  hand-computed values exactly to the paisa.
- **SC-003**: With 50 active and 50 archived accounts, the accounts screen shows all balances and
  the net-worth summary within 2 seconds of opening it.
- **SC-004**: Automated isolation tests show 0 cases in which a user — including the owner-admin —
  can read or change another user's accounts or their change history.
- **SC-005**: 100% of account changes made during acceptance testing appear in the change history
  with correct before/after values, and none appears in operational logs with names or amounts.
- **SC-006**: With hide-balances on, a review of every accounts screen finds 0 unmasked amounts.
- **SC-007** (Android phase): 20 account changes made offline across two devices, including
  conflicting edits and duplicate names, sync with 0 lost changes, 0 duplicated accounts, and both
  devices showing identical lists within 1 minute of reconnecting.

## Assumptions

- **Delivery order**: the owner chose a web-first build (2026-10-24). User Stories 1–4 are built
  for the web in this module; User Story 5 and the Android accounts screens are built in the Android
  phase. Because the constitution makes R2's plan choose the offline sync engine, this module's plan
  still selects it and shapes the account data so it can sync without rework.
- The web app requires connectivity (constitution IV); it shows R1's "service temporarily
  unavailable" state when the service cannot be reached.
- Balances depend only on opening balances until transactions arrive in R4. A "set balance to
  actual" adjustment is a kind of transaction and therefore belongs to R4.
- Only the four Phase 1 account types are offered; FD/RD, PPF/EPF/NPS, mutual funds, stocks, gold,
  property and loans arrive in Phase 3. Prepaid cards such as meal cards are recorded as wallets.
- Credit-card statement dates, due dates and minimum due are Phase 2b (credit-card cycles); only
  an optional credit limit is recorded now.
- Account numbers, card numbers and bank names are not recorded as separate fields; users may put
  a non-sensitive hint in the name or notes. (Statement import in Phase 2a may add an identifier.)
- Viewing the change history in the app is not part of this module (undo UI is Phase 4); the
  history is captured from the first release as the constitution requires.
- Live push of changes to other open devices is not included; it can be added later (e.g., with
  the R6 dashboard) without changing the account data.
- The net-worth summary appears on the accounts screen in this module; the dashboard (R6) reuses
  the same figures.
- This module defines the accounts part of the fixed, synthetic demo data set (every type, label
  and state), as the constitution requires; the "Load demo data / reset my data" actions that put
  it into a user's space arrive with the demo-data module (R5).
- Examples in this specification use synthetic names, `example.com` emails and made-up amounts only.
