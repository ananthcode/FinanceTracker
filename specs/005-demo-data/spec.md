# Feature Specification: Demo Data

**Feature Branch**: `005-demo-data`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "R5 Demo data (roadmap row R5, depends on R2, R3, R4): per-user 'Load demo
data' and 'Reset / clear my data'. Load inserts a deterministic, synthetic Indian household with about
2 years of history across all Phase 1 account types, nested categories, payees, tags, splits,
transfers, person movements and interest — rich enough to exercise every screen and chart — using the
existing demo generators for accounts (R2), lists (R3) and transactions with interest rates (R4).
Reset clears the signed-in user's own data (accounts, groups, categories, tags, payees, transactions,
rates) so they can start again or reload the demo. Web first (Settings), Android in the Android phase.
Must respect the constitution's synthetic-data and own-data-only rules."

## Clarifications

### Session 2026-10-31

- Q: When a user resets their data, should the change history of the removed records be removed too, or kept? → A: Removed with the records; one "data reset" entry (who, when, device) is kept.
- Q: When a user who already has records chooses to load the demo, what happens? → A: The demo loads only into empty data; otherwise "Reset and load demo data" is offered (clears first, one confirmed step).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Load the demo household (Priority: P1)

A tester (or the owner, before real data exists) signs in to an empty account and, from Settings,
loads the demo household: accounts of every Phase 1 type, account groups, nested categories, tags,
businesses and people, and about two years of transactions — salary, rent, groceries, bills, card
payments by transfer, splits, refunds, every kind of person movement, automatic and manual interest,
some upcoming entries and some waiting to be confirmed. Every screen then has realistic content to
try.

**Why this priority**: Every module is evaluated on synthetic data in the demo environment
(constitution X); without a one-click demo household each tester must type months of history by hand.

**Independent Test**: A new member opens Settings, chooses "Load demo data", confirms, and within
seconds sees a summary of what was added; the Accounts, People, Transactions (with items in "To
confirm"), Categories, Payees and Tags screens all show the demo household, and the same day's
balances are the same for every user who loads it.

**Acceptance Scenarios**:

1. **Given** a signed-in user with no accounts, categories, tags, payees or transactions, **When**
   they choose "Load demo data" in Settings and confirm, **Then** the demo household is added to their
   own data and a summary states how many accounts, categories, tags, payees and people, and
   transactions were added.
2. **Given** the demo household was loaded today, **When** the user opens Accounts, People and
   Transactions, **Then** the balances, net worth and people totals equal the values every other user
   gets when loading on the same day, and the list starts with the most recent transactions up to
   today.
3. **Given** the load finished, **When** the user opens Transactions, **Then** at least one entry
   waits in "To confirm" and at least one is upcoming, and the person with automatic interest has
   proposals for ended months.
4. **Given** the user already has any account, category, tag, payee or transaction, **When** they look
   for "Load demo data", **Then** it is not offered on its own; they are told the demo loads only into
   empty data and offered "Reset and load demo data" instead (US3).
5. **Given** the load fails part-way (lost connection, server error), **When** the user looks at their
   data, **Then** nothing from the demo was kept and they can try again.
6. **Given** two devices or two tabs ask to load at the same moment, **When** both finish, **Then**
   the demo household exists once.

---

### User Story 2 - Reset / clear my data (Priority: P1)

A user clears everything they have recorded — accounts, groups, categories, tags, payees and people,
transactions, interest settings and rates — to start again from empty. Their sign-in, profile and
preferences stay. Because it cannot be undone, they confirm by typing a word.

**Why this priority**: Testers need to return to a clean state between test rounds; the constitution
requires users to be able to reset/clear their own data (X) and allows it as an explicit "erase all my
data" action (III).

**Independent Test**: A user with demo data chooses "Reset my data", reads what will be removed, types
the confirmation word and confirms; afterwards every screen is in its first-use state (Accounts empty
state, Categories start choice), while they stay signed in with their preferences unchanged.

**Acceptance Scenarios**:

1. **Given** a user with records, **When** they choose "Reset my data", **Then** a warning lists what
   will be removed and that it cannot be undone, and the action stays disabled until they type the
   confirmation word exactly.
2. **Given** they confirm, **When** the reset finishes, **Then** none of their accounts, groups,
   categories, tags, payees, people, transactions, rates or their change history remains; their
   sign-in, display name, role and preferences remain; and one entry in the change history records
   that they reset their data (when, from which device) without describing the removed records.
3. **Given** the reset finished, **When** they open Settings › Categories, **Then** the one-time
   "suggested / empty" start choice is offered again.
4. **Given** another user's data, **When** any user resets, **Then** nothing of the other user
   changes (own data only).
5. **Given** the user is signed in on a second device or tab, **When** that device next syncs or
   reloads, **Then** it shows the reset state, and changes it made offline before the reset are not
   brought back.

---

### User Story 3 - Start again with the demo household (Priority: P2)

A tester who has changed the demo data (or entered their own test records) replaces everything with a
fresh copy of the demo household in one step.

**Why this priority**: The common repeat action between test rounds; it combines US2 and US1 but
saves a step and avoids a half-empty state.

**Independent Test**: A user with edited demo data chooses "Reset and load demo data", confirms with
the word, and sees a fresh demo household dated relative to today.

**Acceptance Scenarios**:

1. **Given** a user with any data, **When** they choose "Reset and load demo data" and confirm with the
   word, **Then** their data is cleared and the demo household loaded as in US1, in one step.
2. **Given** that step fails, **When** the user looks at their data, **Then** either the reset and
   the load both happened or neither did.

---

### User Story 4 - Demo data and reset on Android (Priority: P3, Android phase)

The same three actions are available from the Android app's settings, and a phone that is offline
when the data is reset elsewhere shows the reset state once it syncs.

**Why this priority**: Testers use both clients; the web comes first (roadmap build order).

**Independent Test**: Deferred to the Android phase; the server behaviour it relies on (reset seen by
other devices on their next sync) is covered by US2 scenario 5.

**Acceptance Scenarios**:

1. **Given** the Android app, **When** the user loads, resets, or resets and loads, **Then** the
   outcome equals the web's.

---

### Edge Cases

- The live environment (real data, created at go-live): loading synthetic data there would mix demo
  with real records, so "Load demo data" and "Reset and load demo data" are not offered there; "Reset
  my data" is (it is the user's own "erase all my data", constitution III-a).
- The owner-admin uses the same actions on their own data only; resetting never affects other users,
  and erasing another user remains the R1 admin action.
- The demo is generated for the day it is loaded: a user who loads on 31-Oct-2026 gets history up to
  that month, with upcoming entries after it; loading again later (after a reset) moves it forward.
- Very large existing data (e.g. 20,000 transactions) still resets within the time limit (SC-003).
- A reset while the user has the demo data open in another tab: that tab's next action refuses
  cleanly ("this no longer exists") and a reload shows the empty state.
- Hide-balances, number format, date format and other preferences are kept across a reset and apply to
  the loaded demo at once.
- Interest proposals for the demo's automatic-interest person appear on the first page load after the
  demo is loaded, like any user's.
- The demo never contains real names, banks, numbers or amounts (constitution V): it is generated from
  the synthetic generators already in the repository.

## Requirements *(mandatory)*

### Functional Requirements

**Loading the demo**

- **FR-001**: Users MUST be able to load the demo household into their own data from Settings, in the
  demo environment only, when they have no accounts, groups, categories, tags, payees or transactions.
- **FR-002**: The demo household MUST be deterministic for a given day: every user who loads it on the
  same day gets the same records with the same amounts, dates, balances and totals; the history runs
  from the demo's start date (01-Apr-2025) to the month of the day it is loaded.
- **FR-003**: The demo MUST include every Phase 1 account type (bank, cash, wallet, credit card),
  account groups, an archived account and one excluded from net worth; nested expense and income
  categories (including a hidden one); tags; businesses with default categories; people who owe the
  user, whom the user owes and who are settled (one hidden); and transactions covering every type and
  person action, splits, refunds, transfers, every status, upcoming and awaiting-confirmation entries,
  tags on transactions, and one person with automatic and one with manual interest with rate history.
- **FR-004**: Loading MUST be all or nothing, and MUST add the demo at most once even when requested
  twice at the same time.
- **FR-005**: After loading, the user MUST see a summary of what was added (counts per kind) and every
  screen MUST show the demo at once (no sign-out or reload needed).
- **FR-006**: Loading MUST record the categories start choice as made, so the start choice is not
  offered over the demo categories.

**Resetting**

- **FR-007**: Users MUST be able to reset their own data from Settings: accounts, account groups,
  categories, tags, payees and people, transactions and split lines, interest settings and rates, and
  the change history of those records are permanently removed.
- **FR-008**: Reset MUST keep the user's sign-in, profile (display name, role, status), preferences
  and per-device settings, and MUST clear the categories start choice so it is offered again.
- **FR-009**: Reset MUST require confirmation: a warning stating what is removed and that it cannot be
  undone, and typing a confirmation word exactly before the action is enabled.
- **FR-010**: Reset MUST be all or nothing and MUST affect only the signed-in user's data.
- **FR-011**: The change history MUST keep one entry per reset and per demo load, recording who, when
  and the device type, without describing removed records.
- **FR-012**: After a reset, the user's other devices and tabs MUST show the reset state on their next
  sync or reload, and changes they made offline before the reset MUST NOT be applied afterwards.

**Reset and load**

- **FR-013**: Users MUST be able to reset and load the demo in one confirmed step (demo environment
  only), which either fully happens or does not happen.

**Clients**

- **FR-014**: The web offers these actions in Settings in a "Your data" section; Android offers the
  same in the Android phase.
- **FR-015**: The actions MUST be accessible (keyboard, screen reader, both widths) and their results
  stated in words.

### Key Entities

- **Demo household**: the synthetic set of accounts, groups, categories, tags, payees and people,
  transactions and interest rates generated for a given day; never stored as such — it becomes the
  user's ordinary records when loaded.
- **Data reset**: a user's request to remove all their financial records; leaves one history entry.
- **Demo load**: a user's request to add the demo household; leaves one history entry plus the normal
  history of the records it creates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Loading the demo household completes and every screen shows it within 10 seconds of
  confirming.
- **SC-002**: Two users who load the demo on the same day see identical balances, net worth, people
  totals and transaction counts.
- **SC-003**: Resetting a user with up to 20,000 transactions completes within 10 seconds, and
  afterwards they have 0 financial records.
- **SC-004**: After loading, each of Accounts, People, Transactions (including "To confirm"),
  Categories, Payees and Tags shows content, and every transaction type and person action appears at
  least once.
- **SC-005**: No reset or load ever changes another user's data (proved by tests).
- **SC-006**: A tester can go from any state to a fresh demo household in under 1 minute.

## Assumptions

- The demo generators from R2, R3 and R4 (accounts, lists, transactions with rates) define the
  household; R5 adds loading, resetting and the screens, not new demo content (later modules extend
  the generators — constitution X).
- "Demo environment" is the deployment flagged as demo (R1); until a live environment exists, local
  and preview deployments count as demo.
- The confirmation word is "RESET" (in capitals), like the typed email of R1's admin erase.
- Reset does not sign the user out and does not change their preferences, including hide-balances.
- Records created by a demo load are ordinary records: the user can edit or delete them; history
  records each creation (constitution III) plus one summary entry for the load.
- Android support (US4) is deferred to the Android phase; the server side it needs (reset seen on next
  sync) is part of this module.
