---

description: "Task list for R2 — Accounts & Balances"
---

# Tasks: Accounts & Balances

**Input**: Design documents from `/specs/002-accounts-balances/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (sync-protocol.md,
http-api.md, database.md, client-accounts.md), quickstart.md

**Tests**: Included — required by constitution Principle IX and spec SC-002, SC-004, SC-005,
SC-007. Within each phase, write the listed tests first and see them fail before implementing.

**Organization**: Tasks are grouped by user story. Per the owner's web-first decision
(2026-10-24), Stories 1–4 are built for the web now; Story 5 is split into its **server side**
(built and tested now, so the sync engine chosen in research R2-01 exists) and its **Android
client** (deferred to the Android phase, tasks kept here and marked *Deferred*).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story from spec.md (US1–US5)
- Migration file names use the prefix `YYYYMMDDHHMMSS_`; use the timestamp at creation time
  (shown as `<ts>`), keeping the listed order.

## Path Conventions

As R1 (`apps/web`, `apps/mobile/src/…`, `packages/core`, `packages/db`, `supabase/`). Core tests
live in `packages/core/test/` (R1 convention), so the plan's `packages/core/src/test/vectors/` is
`packages/core/test/vectors/`. Web route files follow Next.js 16 (`proxy.ts`, async `params`).

---

## Phase 1: Setup

**Purpose**: Dependencies and shared constants

- [X] T001 Add `@dnd-kit/core`, `@dnd-kit/sortable` and `@dnd-kit/utilities` to `apps/web/package.json` (pin exact versions at least two weeks old; research R2-09)
- [X] T002 [P] Add error codes `NAME_TAKEN`, `GROUP_NAME_TAKEN`, `BALANCE_NOT_ZERO`, `HAS_ACTIVITY`, `LIMIT_REACHED`, `DATE_IN_FUTURE` to `ERROR_CODES` in `packages/core/src/schemas/common.ts` (contracts/http-api.md)
- [X] T003 [P] Create module folders with barrel files `packages/core/src/accounts/index.ts`, `packages/core/src/sync/index.ts`, `packages/core/src/ordering/index.ts` and export them from `packages/core/src/index.ts` (no React or Supabase imports)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared domain primitives, the database schema with the single write path, and the
web push path that every story writes through.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for the foundation (write first)

- [X] T004 [P] Unit tests in `packages/core/test/parse-amount.test.ts` for `parseAmountInput`: `"52340.50"`→`5234050n`; `"₹52,340.50"`, `"52,340.50"` and Indian `"5,23,40,000.00"` accepted; `"1,234.567"`→`TOO_MANY_DECIMALS` (never rounded); `"-500"` only when `allowNegative`; limit `±999999999999` paise (`"9,99,99,99,999.99"` ok, one paisa more → `OUT_OF_RANGE`); empty/`"abc"`/`"1.2.3"`→`NOT_A_NUMBER`; `"0"`→`0n` (research R2-11)
- [X] T005 [P] Unit tests in `packages/core/test/ordering-keys.test.ts` for `keyBetween(a, b)`: start/end/middle keys, 1,000 successive inserts at the same gap stay ordered and short, `a < b` required (research R2-06)
- [X] T006 [P] Unit tests in `packages/core/test/hlc.test.ts`: monotonic `next()` with a frozen and a backwards clock, `observe()` advances past pulled HLCs, `compare()` total order (wall, counter, device id), `clamp(hlc, receivedAt)` caps wall time at receivedAt + 5 min and reports it (contracts/sync-protocol.md §HLC)
- [X] T007 [P] Create shared vectors `packages/core/test/vectors/merge.json` (different fields combine; same field newer wins; older loses and is reported in `ignoredFields`; tie broken by device id then change id; clamp applied; state field archive vs later edit) and tests `packages/core/test/merge.test.ts` running `mergeFields` over them
- [X] T008 [P] Create shared vectors `packages/core/test/vectors/balances.json` (zero; overdrawn bank −50000; credit card owed 1825000; card in credit −120000; excluded account; archived account; max ±999999999999; mixed user group; credit card with limit 5000000 and owed 1825000 → available 3175000, and owed above the limit → available 0 shown as "over limit") with expected per-group subtotals, Owned, Owed, Net worth and available credit, and tests `packages/core/test/accounts-summary.test.ts` for `currentBalance`, `summarise` (both views), `balanceLabel` and `availableCredit` (SC-002, FR-006)
- [X] T009 [P] pgTAP access rules `supabase/tests/accounts_rls.test.sql` proving contracts/database.md rules 1–6 and 8: A cannot read B's `accounts`/`account_groups`/`private.applied_changes` (also through `app.pull_changes`); owner-admin reads none; `authenticated` insert/update/delete on both tables fails; `apply_changes` by A with B's account id reports `NOT_FOUND` and changes nothing; disabled user gets `USER_INACTIVE`; clients cannot read `account`/`account_group` audit rows; erasing a user leaves none of their accounts, groups, applied changes or account history (SC-004)
- [X] T010 [P] pgTAP behaviour `supabase/tests/accounts_apply.test.sql`: create/update/archive/restore/delete per data-model.md state transitions; per-field merge using the same cases as `packages/core/test/vectors/merge.json`; replayed `changeId` → `duplicate` and applied once (rule 7); `onNameConflict: "reject"` → `NAME_TAKEN`, `"suffix"` → `renamed` to next free `" (n)"` within 40 chars; archive with balance ≠ 0 → `BALANCE_NOT_ZERO`; delete with activity (stub `app.account_has_activity` to true) → `converted` or `HAS_ACTIVITY`; future `openingBalanceDate` in the user's timezone → `DATE_IN_FUTURE`; 201st account / 31st group → `LIMIT_REACHED`; currency forced to base currency; `credit_limit_minor` rejected for non-credit-card types; `server_seq` strictly increases per user
- [X] T011 [P] pgTAP audit `supabase/tests/accounts_audit.test.sql`: every apply writes one `audit_events` row per changed row with action (`account_created`, `account_edited`, `account_reordered`, `account_archived`, `account_restored`, `account_deleted`, `account_sync_renamed`, `account_group_*`), `target_type`, `target_id = row id`, `device_type` from `p_device`, `details.ownerId`, and `{field: {before, after}}` excluding `server_seq`, `field_versions`, `updated_at`; a losing field produces no change entry but the winning older value stays recoverable from the earlier row (SC-005)
- [X] T012 [P] Unit test `apps/web/lib/api/log.test.ts`: `logError` output never contains change payload values, account names, notes or amounts (FR-028)

### Domain primitives (packages/core)

- [X] T013 [P] Implement `parseAmountInput(text, { allowNegative })` in `packages/core/src/money/parse.ts` returning `bigint` paise or `{ error: "TOO_MANY_DECIMALS" | "OUT_OF_RANGE" | "NOT_A_NUMBER" }`; pure string arithmetic, no floats (Principle II)
- [X] T014 [P] Implement `keyBetween(a, b)` (vendored fractional-indexing algorithm, MIT notice in file header) in `packages/core/src/ordering/keys.ts`
- [X] T015 [P] Implement `Hlc` (`format`, `parse`, `next`, `observe`, `compare`, `clamp`) in `packages/core/src/sync/hlc.ts` — format `wallMillis.counter(4 digits).deviceId`
- [X] T016 Implement sync schemas in `packages/core/src/sync/schemas.ts`: `Change` (changeId uuid, entity `"account" | "account_group"`, entityId uuid, kind `"create" | "update" | "archive" | "restore" | "delete"`, fields, hlc, options.onNameConflict `"reject" | "suffix"`), `PushRequest` (`device: "web" | "android"`, 1–100 changes), `ChangeResult` (status `applied | duplicate | renamed | converted | rejected`, appliedFields, ignoredFields, renamedTo, code, clamped), `PullResponse`; money as decimal strings of integer paise (`/^-?\d{1,12}$/`), never numbers; server-controlled fields (`userId`, `currency`, `state`, timestamps, `fieldVersions`, `serverSeq`) rejected (contracts/sync-protocol.md)
- [X] T017 [P] Implement account field schemas in `packages/core/src/accounts/schemas.ts`: name trimmed "1–40 chars"; type enum `bank | cash | wallet | credit_card`; `openingBalanceMinor` "within ±₹9,99,99,99,999.99"; `openingBalanceDate` `yyyy-MM-dd`; colour/icon from appearance keys; notes "≤ 500 chars"; `creditLimitMinor` "> 0, credit_card only"; group name "1–30 chars"; plus `AccountView`/`GroupView` read models with `bigint` money
- [X] T018 [P] Implement `ACCOUNT_COLOURS` (12 token keys, ≥ 3:1 contrast against card background in both themes), `ACCOUNT_ICONS` (~24 keys) and `defaultAppearance(type)` in `packages/core/src/accounts/appearance.ts` (research R2-10)
- [X] T019 Implement `mergeFields(row, change, receivedAt)` in `packages/core/src/sync/merge.ts` (pure; uses `Hlc.clamp`/`compare`; returns new row, appliedFields, ignoredFields, clamped) — passes T007
- [X] T020 Implement `currentBalance`, `summarise(accounts, view, groups)`, `balanceLabel` and `availableCredit(account, balance)` (limit − owed, never below 0, with an `overLimit` flag; `null` without a limit — FR-006) in `packages/core/src/accounts/balance.ts`, `summary.ts`, `labels.ts`: credit cards stored as owed (positive = owed), others as held; Owned/Owed/Net worth over active, included accounts only; archived with non-zero balance counted and flagged `archivedWithBalance`; mixed user groups labelled net — passes T008

### Database (supabase/migrations)

- [X] T021 Migration `supabase/migrations/<ts>_accounts_enums.sql`: types `public.account_type` (`bank`, `cash`, `wallet`, `credit_card`), `public.record_state` (`active`, `archived`, `deleted`), `public.accounts_view` (`by_type`, `my_groups`); add the 11 `account_*`/`account_group_*` values to `public.audit_action`; extend `audit_events.target_type` check with `account`, `account_group`
- [X] T022 Migration `supabase/migrations/<ts>_sync_infrastructure.sql`: schema `sync`; sequence `sync.seq`; trigger function `sync.stamp_row()` (`pg_advisory_xact_lock` on the row owner, `server_seq = nextval('sync.seq')`, `updated_at = now()`); table `private.applied_changes(user_id uuid → auth.users on delete cascade, change_id uuid, applied_at timestamptz, result jsonb, primary key (user_id, change_id))` with no client grants (research R2-03, R2-04)
- [X] T023 Migration `supabase/migrations/<ts>_audit_record_change.sql`: `audit.capture_record_change()` per research R2-08 (args: action family, target type; reads `current_setting('app.device_type', true)`; details `{ownerId, changes, changeId, hlc, clamped}` from `app.change_context` setting)
- [X] T024 Migration `supabase/migrations/<ts>_accounts.sql`: `public.account_groups` and `public.accounts` exactly as data-model.md (synced-table columns; `name` check `char_length(btrim(name)) between 1 and 40` / groups `between 1 and 30`; partial unique indexes `(user_id, lower(name)) where state <> 'deleted'` (accounts) and `where state = 'active'` (groups); `opening_balance_minor between -999999999999 and 999999999999`; `credit_limit_minor is null or (type = 'credit_card' and credit_limit_minor > 0)`; `char_length(notes) <= 500`; colour/icon in allowed arrays mirrored from `packages/core/src/accounts/appearance.ts`; `group_id` FK); RLS select-own with `app.is_active_user()`; grant select only; triggers `sync.stamp_row` (before insert/update) and `audit.capture_record_change` (after insert/update)
- [X] T025 Migration `supabase/migrations/<ts>_account_rules.sql`: `app.account_balance_minor(uuid)` (opening balance; comment marks where R4 adds movements) and `app.account_has_activity(uuid)` returning `false` (R4 replaces), not executable by clients
- [X] T026 Migration `supabase/migrations/<ts>_apply_changes.sql`: `app.apply_changes(p_changes jsonb, p_device text) returns jsonb` per contracts/database.md (SECURITY DEFINER, `auth.uid()` scoping, idempotency first, validation, per-field merge identical to `mergeFields`, state rules, name conflicts, limits 200/30, group deletion clears `group_id` on its accounts, sets `app.device_type` and `app.change_context`); grant execute to `authenticated` only — passes T009–T011
- [X] T027 Migration `supabase/migrations/<ts>_pull_changes.sql`: `app.pull_changes(p_cursor bigint, p_limit int default 500) returns jsonb` (SECURITY INVOKER; rows of both tables with `server_seq > p_cursor`, incl. deleted, ordered; next cursor; `hasMore`)
- [X] T028 Migration `supabase/migrations/<ts>_erasure_accounts.sql`: extend `app.scrub_user_from_audit()` to first delete `audit_events` rows with `target_type in ('account','account_group')` and `details->>'ownerId' = p_user` (research R2-08)
- [X] T029 Regenerate `packages/db/src/types.gen.ts` with `pnpm db:types` and run `pnpm db:test` (T009–T011 green)

### Data access and the web push path

- [X] T030 [P] Implement repositories in `packages/db/src/repositories/accounts.ts` (`listAccounts`, `listGroups` → core read models with `bigint` money; excludes `deleted`) and `packages/db/src/repositories/sync.ts` (`pushChanges(db, request)`, `pullChanges(db, cursor)` RPC wrappers mapping errors), exported from `packages/db/src/index.ts`
- [X] T031 Implement `POST /api/sync/push` in `apps/web/app/api/sync/push/route.ts` with the R1 `route()` wrapper: body `PushRequest`; `device` must match the auth method (cookie → `web`, bearer → `android`) else `422`; whole batch rejected on any schema failure; body ≤ 256 KB; rate limit 120 changes/minute/user via `private.rate_limits`; returns `{ results }`; logs only counts (FR-028)
- [X] T032 [P] Integration test `apps/web/app/api/sync/push/push.int.test.ts`: web cookie push applies, CSRF origin enforced, device/auth mismatch → 422, malformed change → 422 with nothing applied, replay returns `duplicate`, disabled user → `401 USER_INACTIVE` (R1's code, which signs the device out); a change failing only a database-side check (group owned by someone else) → `200` with that change `rejected` / `VALIDATION_FAILED` and the rest of the batch applied
- [X] T033 Implement browser sync client `apps/web/lib/sync-client.ts`: device id (random, `localStorage`, try/catch fallback to session memory), persisted HLC, `pushChanges(changes)` via `apiFetch`, change builders `createAccount`, `updateAccount(id, changedFieldsOnly)`, `archive`/`restore`/`delete`, group equivalents; on success calls `router.refresh()` (research R2-05, FR-014)

**Checkpoint**: Foundation ready — core primitives tested, schema with the single write path
tested, web can push changes.

---

## Phase 3: User Story 1 - Add accounts with opening balances (Priority: P1) 🎯 MVP

**Goal**: A user adds bank, cash, wallet and credit-card accounts with exact opening balances and
sees them listed by type with their balances.

**Independent Test**: quickstart S1-a…S1-c.

### Tests for User Story 1

- [X] T034 [P] [US1] Playwright `apps/web/e2e/r2-us1-add-accounts.spec.ts`: empty state with "Add account" (S1-a); add the three synthetic accounts and see them under Bank accounts / Cash / Credit cards with "₹18,250.00 owed" (S1-b); duplicate name ignoring case, future date and `1,234.567` each refused with a message and nothing saved (S1-c); first account added in < 1 min (SC-001)

### Implementation for User Story 1

- [X] T035 [P] [US1] Implement `AccountIcon` (icon key → lucide-react, colour token → class) in `apps/web/components/accounts/AccountIcon.tsx`
- [X] T036 [P] [US1] Implement `AccountRow` in `apps/web/components/accounts/AccountRow.tsx`: icon, name, type label, balance through `<Money>` with `balanceLabel` text ("owed", "in credit", "overdrawn") — never colour alone (FR-015); for a credit card with a limit, a second line "Available ₹X of ₹Y" (or "Over limit by ₹Z") via `availableCredit` and `<Money>` (FR-006)
- [X] T037 [US1] Replace the placeholder `apps/web/app/(app)/accounts/page.tsx` with a server component reading `listAccounts`/`listGroups` + preferences and rendering type groups (order Bank accounts, Cash, Wallets, Credit cards) by `sort_key`, or the empty state explaining accounts with an "Add account" link (US1 scenario 1)
- [X] T038 [US1] Implement `AccountForm` in `apps/web/components/accounts/AccountForm.tsx` (react-hook-form + core schemas): name, type (with the held/owed meaning text — FR-005), opening balance via `parseAmountInput` (negative allowed, explained), date defaulting to today in the user's timezone and refusing future dates (FR-004), colour/icon pickers with type defaults (FR-008), notes, credit limit only for credit cards (FR-006), "Include in net worth" (default on); maps rejection codes (`NAME_TAKEN`, `DATE_IN_FUTURE`, `LIMIT_REACHED`) to field messages
- [X] T039 [US1] Implement `/accounts/new` in `apps/web/app/(app)/accounts/new/page.tsx` using `AccountForm` in create mode: new account gets `sortKey = keyBetween(lastKeyInUserOrder, null)`, pushes a `create` with `onNameConflict: "reject"`, returns to `/accounts` with the list refreshed (US1 scenario 2)

**Checkpoint**: US1 works on its own — accounts can be added and are listed with exact balances.

---

## Phase 4: User Story 2 - See balances and net worth at a glance (Priority: P1)

**Goal**: Owned / Owed / Net worth and per-group subtotals, exact to the paisa, respecting
exclusion and hide-balances.

**Independent Test**: quickstart S2-a…S2-c.

### Tests for User Story 2

- [ ] T040 [P] [US2] Playwright `apps/web/e2e/r2-us2-net-worth.spec.ts`: summary Owned ₹54,340.50 · Owed ₹18,250.00 · Net worth ₹36,090.50 and matching subtotals (S2-a); overdrawn bank and excluded cash labelled and totals recomputed exactly (S2-b); negative net worth shows sign + label; hide-balances masks every amount on `/accounts` (S2-c, SC-006)

### Implementation for User Story 2

- [ ] T041 [P] [US2] Implement `NetWorthSummary` in `apps/web/components/accounts/NetWorthSummary.tsx` from `summarise()` (Owned, Owed, Net worth via `<Money>`; negative net worth labelled; explanation when all accounts are excluded or archived)
- [ ] T042 [P] [US2] Implement `GroupSection` in `apps/web/components/accounts/GroupSection.tsx`: header with subtotal (labelled "net" for mixed user groups — FR-017), rows, "excluded from net worth" marker (FR-018)
- [ ] T043 [US2] Wire `NetWorthSummary` and `GroupSection` into `apps/web/app/(app)/accounts/page.tsx` so totals come only from `summarise()` (FR-019) and update after every push (FR-014)
- [ ] T044 [US2] Add `/accounts` to the hide-balances screen review list used by the R1 hide-balances e2e (`apps/web/e2e/us7-hide-balances.spec.ts`) (SC-006)

**Checkpoint**: US1 + US2 — the MVP: accounts with exact balances and net worth.

---

## Phase 5: User Story 3 - Edit and personalise accounts (Priority: P2)

**Goal**: Edit every field, reorder (drag and keyboard), and organise accounts into user groups
with a "My groups" view.

**Independent Test**: quickstart S3-a…S3-c and S4-c (two tabs).

### Tests for User Story 3

- [ ] T045 [P] [US3] Playwright `apps/web/e2e/r2-us3-edit-groups.spec.ts`: rename/recolour/icon/opening-balance edit updates list and totals at once (S3-a); reorder by drag and by keyboard Move up, order kept after reload and in a second browser context (FR-010); type change cash→credit card shows a confirmation and cancel keeps it (S3-b); create groups, assign, switch to My groups, delete a group → accounts in "Ungrouped", totals unchanged, view choice remembered after reload (S3-c); two tabs editing different fields both kept (S4-c)
- [ ] T046 [P] [US3] Integration test `apps/web/app/api/me/accounts-view.int.test.ts`: `PATCH /api/me/preferences { accountsView }` stored, returned by `GET /api/me`, audited as a preference change

### Implementation for User Story 3

- [ ] T047 [US3] Migration `supabase/migrations/<ts>_accounts_view_preference.sql`: `user_preferences.accounts_view public.accounts_view not null default 'by_type'`; grant update on the column to `authenticated`; regenerate types
- [ ] T048 [US3] Add `accountsView` to `Preferences`/`PreferencesUpdate`/`DEFAULT_PREFERENCES` in `packages/core/src/schemas/me.ts`, the preferences repository `packages/db/src/repositories/preferences.ts`, and the `PATCH /api/me/preferences` / `GET /api/me` responses (`apps/web/lib/me.ts`)
- [ ] T049 [US3] Implement `/accounts/[id]` in `apps/web/app/(app)/accounts/[id]/page.tsx` with `AccountForm` in edit mode: sends `update` with only changed fields (research R2-05); type change between owned and owed opens a confirmation describing the effect on Owned/Owed/Net worth (FR-011); user group select
- [ ] T050 [US3] Implement `SortableList` in `apps/web/components/accounts/SortableList.tsx` (dnd-kit with keyboard sensor and screen-reader announcements, plus Move up / Move down buttons on each row); a move sends one `update { sortKey: keyBetween(prev, next) }` (FR-010, research R2-06, R2-09)
- [ ] T051 [US3] Implement `ViewSwitch` in `apps/web/components/accounts/ViewSwitch.tsx` (By type / My groups, saved via `PATCH /api/me/preferences`) and the My groups rendering in `apps/web/app/(app)/accounts/page.tsx` (user groups by their `sort_key`, then "Ungrouped") (FR-009)
- [ ] T052 [US3] Implement `/accounts/groups` in `apps/web/app/(app)/accounts/groups/page.tsx`: create, rename (1–30 chars, unique ignoring case → `GROUP_NAME_TAKEN`), reorder with `SortableList`, delete with confirmation explaining accounts move to "Ungrouped" (FR-009a/b)

**Checkpoint**: US3 works; both views and one user-wide order.

---

## Phase 6: User Story 4 - Archive, restore and delete accounts (Priority: P2)

**Goal**: Archive only at ₹0.00, restore in place, delete only accounts without activity.

**Independent Test**: quickstart S4-a, S4-b.

### Tests for User Story 4

- [ ] T053 [P] [US4] Playwright `apps/web/e2e/r2-us4-archive.spec.ts`: archive a ₹0.00 account → moves to "Archived accounts", totals unchanged; non-zero account → refused showing its balance (S4-a); restore returns to previous position; delete a never-used account → gone everywhere; creating an archived account's name → refused with a "restore it" hint (S4-b); archiving the last active account shows the empty state with a link to archived accounts

### Implementation for User Story 4

- [ ] T054 [US4] Add Archive / Restore / Delete actions to `apps/web/app/(app)/accounts/[id]/page.tsx`: Archive disabled with the explanation and current balance when the balance ≠ ₹0.00 (FR-022); Delete shown only without activity, with confirmation (FR-024); results `converted`/`rejected` shown in words
- [ ] T055 [US4] Add the "Archived accounts" section (collapsed by default, rows with Restore) and the "archived with a balance" flag to `apps/web/app/(app)/accounts/page.tsx`; ensure archived accounts are excluded from every account chooser via a `selectableAccounts()` helper in `packages/core/src/accounts/summary.ts` for R4 (FR-021)
- [ ] T056 [US4] In `AccountForm` (`apps/web/components/accounts/AccountForm.tsx`) map `NAME_TAKEN` for an archived account to "An archived account has this name — restore it or choose another name" with a link (US4 scenario 6)

**Checkpoint**: US1–US4 complete on the web.

---

## Phase 7: User Story 5 - Manage accounts offline on Android (Priority: P3)

**Goal**: Offline create/edit/reorder/archive/restore on Android with automatic, exactly-once
sync and the clarified per-field rule.

**Independent Test**: quickstart S5-a…S5-e (Android phase).

### Server side (built now)

- [ ] T057 [P] [US5] Integration test `apps/web/app/api/sync/pull/pull.int.test.ts` with two simulated Android devices (bearer tokens, separate HLC/device ids): offline edits on both then push → per-field combination and newer-field wins; duplicated batch delivery → applied once; two offline creates "Fuel" → second `renamed` "Fuel (2)"; delete with activity → `converted`; pull pages of 500 with `hasMore`; a cursor never skips rows when pushes from two devices interleave (SC-007 server side)
- [ ] T058 [US5] Implement `GET /api/sync/pull?cursor=` in `apps/web/app/api/sync/pull/route.ts` (user auth; cursor validated as a non-negative integer string; ≤ 60 requests/minute/user; returns `PullResponse` with money as decimal strings)

### Android client (Deferred — Android phase)

- [ ] T059 [P] [US5] *Deferred* Jest tests `apps/mobile/src/__tests__/sync-engine.test.ts` with a fake server: local write + outbox in one transaction, retry after network failure, duplicate results handled, pull overwrites rows without pending changes and re-applies pending fields, HLC observe after pull, renamed/converted/rejected results surfaced
- [ ] T060 [US5] *Deferred* Implement the local store `apps/mobile/src/lib/sync/store.ts` (expo-sqlite per user: `accounts`, `account_groups`, `pending_changes`, `sync_state` — data-model.md §On device)
- [ ] T061 [US5] *Deferred* Implement the sync loop `apps/mobile/src/lib/sync/engine.ts` (triggers: connectivity regained via `useOffline`, app foreground, 2 s after a local change while online, every 5 min online; push then pull; research R2-15)
- [ ] T062 [US5] *Deferred* Implement Android accounts screens replacing the placeholder `apps/mobile/src/app/(tabs)/accounts.tsx` (+ add/edit/groups screens) per contracts/client-accounts.md, reading the local store
- [ ] T063 [US5] *Deferred* Show the pending-changes count and include account changes in the R1 sign-out warning (`apps/mobile/src/lib/sign-out.ts`); keep `pending_changes` sealed and user-tagged on the 5-wrong-PIN wipe (FR-033, R-09)

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T064 [P] Accessibility: extend `apps/web/e2e/a11y.spec.ts` to `/accounts`, `/accounts/new`, `/accounts/[id]`, `/accounts/groups` (axe WCAG AA, focus order, keyboard reordering, labels not colour alone — Principle XIII)
- [ ] T065 [P] Performance: Playwright `apps/web/e2e/r2-performance.spec.ts` seeding 50 active + 50 archived synthetic accounts; `/accounts` shows all balances and the summary within 2 s (SC-003)
- [ ] T066 [P] Create the deterministic demo account set in `packages/core/src/demo/accounts.ts` (constitution X): a pure function returning the same synthetic accounts and groups every time — at least one of each type (`bank`, `cash`, `wallet`, `credit_card`), a credit card with a credit limit, an overdrawn bank account, an account excluded from net worth, an archived ₹0.00 account, two user groups and an ungrouped account; synthetic names only, fixed UUIDs, amounts in `bigint` paise; with a unit test `packages/core/test/demo-accounts.test.ts` proving it is deterministic, passes the account schemas and exercises every label from `balanceLabel`. R5's "Load demo data" inserts this set; R2 does not add a loader
- [ ] T067 Add an `account` seed helper to `apps/web/e2e/helpers/db.ts` (synthetic names, `example.com` users) that can insert the T066 demo set or N generated accounts, used by T053, T065
- [ ] T068 Write `specs/002-accounts-balances/review-notes.md` listing the code that needs explicit owner review (constitution workflow): `app.apply_changes` scoping, RLS/grants, `sync.stamp_row` lock, `mergeFields` + SQL merge, balance functions, erasure extension
- [ ] T069 Run the full quickstart (automated suites + manual S1–S4 rows) and record results in `specs/002-accounts-balances/validation.md`
- [ ] T070 Converge: update contracts with any deviations found during implementation, set R2 status in `ROADMAP.md`, and note in `ROADMAP.md` that Story 5's Android client (T059–T063) is carried into the Android phase

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories.
- Within Foundational: tests T004–T012 first; core T013–T020 before DB merge parity (T026 mirrors
  T019); migrations T021 → T022 → T023 → T024 → T025 → T026 → T027 → T028 → T029; then T030 →
  T031/T032 → T033.
- **US1 (P1)**: after Foundational.
- **US2 (P1)**: after US1's page (T037); can share the sprint with US1.
- **US3 (P2)**: after US1 (form and page); independent of US2 except the summary refresh.
- **US4 (P2)**: after US3's edit page (T049).
- **US5 server (P3)**: after Foundational (T027, T030); independent of US1–US4.
- **US5 Android client**: Android phase.
- **Polish**: after the stories it covers.

### Parallel Opportunities

- Foundational tests T004–T012 all in parallel; core T013–T015, T017, T018 in parallel.
- US1: T035 and T036 in parallel with T034.
- US2: T041 and T042 in parallel.
- US5 server (T057–T058) can run alongside US3/US4.
- Polish T064–T066 in parallel; T067 after T066.

### Parallel Example: Foundational tests

```text
T004 parse-amount.test.ts   T005 ordering-keys.test.ts   T006 hlc.test.ts
T007 merge vectors          T008 balance vectors         T009–T011 pgTAP files   T012 log test
```

## Implementation Strategy

### MVP First

1. Phases 1–2 (foundation, including the single write path and its tests).
2. Phase 3 (US1) → validate S1-a…c.
3. Phase 4 (US2) → validate S2-a…c. **MVP: accounts with exact balances and net worth.**

### Incremental Delivery

4. US3 (edit, order, groups) → S3 rows.
5. US4 (archive/restore/delete) → S4 rows.
6. US5 server side → pull integration tests (Android-ready sync).
7. Polish, quickstart run, converge, PR. Android client tasks stay open for the Android phase.

## Notes

- Commit after each phase with Conventional Commits; flag RLS, sync and money changes for review.
- Fixtures and seeds are synthetic only (Principle V).
- Total: 70 tasks (65 now, 5 deferred to the Android phase).
