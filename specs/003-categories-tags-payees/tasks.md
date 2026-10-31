---

description: "Task list for R3 — Categories, Tags & Payees"
---

# Tasks: Categories, Tags & Payees

**Input**: Design documents from `/specs/003-categories-tags-payees/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (sync-protocol.md,
http-api.md, database.md, client-lists.md), quickstart.md

**Tests**: Included — required by constitution Principle IX and spec SC-003 … SC-008. Within each
phase, write the listed tests first and see them fail before implementing.

**Organization**: Tasks are grouped by user story. Per the owner's web-first decision (2026-10-24),
Stories 1–5 are built for the web now; Story 6 is split into its **server side** (built now) and its
**Android client** (deferred to the Android phase, marked *Deferred*).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story from spec.md (US1–US6)
- Migration file names use the prefix `YYYYMMDDHHMMSS_` with the timestamp at creation (shown as
  `<ts>`), keeping the listed order.

## Path Conventions

As R2. Core tests in `packages/core/test/` (vectors in `packages/core/test/vectors/`); web routes
follow Next.js 16 (async `params`); e2e helpers in `apps/web/e2e/helpers/`.

---

## Phase 1: Setup

**Purpose**: Shared constants and module folders

- [X] T001 [P] Add error codes `HAS_SUBCATEGORIES`, `INVALID_MOVE`, `INVALID_MERGE` to `ERROR_CODES` in `packages/core/src/schemas/common.ts` and to `REJECTION_CODES` in `packages/core/src/sync/schemas.ts`; fix that file's stale "422" comment to "400" (research R3-11, R3-16)
- [X] T002 [P] Create module folders with barrels `packages/core/src/categories/index.ts`, `tags/index.ts`, `payees/index.ts`, `people/index.ts`, `appearance/index.ts` and export them from `packages/core/src/index.ts` (no React or Supabase imports)
- [X] T003 Move the icon list to `packages/core/src/appearance/icons.ts` as `APPEARANCE_ICON_KEYS` (R2's 24 keys first, unchanged, then 24 category keys per research R3-09) with `ACCOUNT_ICON_KEYS` re-exported as the first 24; update `packages/core/src/accounts/appearance.ts` and `apps/web/components/accounts/AccountIcon.tsx` (rename to `apps/web/components/AppIcon.tsx`, map all 48 keys to lucide icons); `packages/core/test/appearance.test.ts` asserts the 48 keys are unique and every key has a web icon

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schemas, the three tables with RLS, sync registration and the shared appliers every
story writes through.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for the foundation (write first)

- [X] T004 [P] Unit tests `packages/core/test/lists-schemas.test.ts`: category name "1–40 chars after trimming", kind create-only (`update` with `kind` rejected), colour/icon keys; tag name "1–30 chars"; payee name "1–60 chars", notes "≤ 500 chars", person requires `openingBalanceDate`, business must not carry non-zero opening fields; `merge` fields exactly `{ targetId }`; server-controlled fields (`userId`, `state`, `mergedInto`, `fieldVersions`, `serverSeq`) rejected; `Change` accepts the new entities only with their allowed kinds (contracts/sync-protocol.md)
- [X] T005 [P] pgTAP access rules `supabase/tests/lists_rls.test.sql` proving contracts/database.md rules 1–3 and 6–8 for `categories`, `tags`, `payees`: A cannot read B's rows (also via `app.pull_changes`); owner-admin reads none; `authenticated` insert/update/delete fail; disabled user gets `USER_INACTIVE`; clients cannot read `category`/`tag`/`payee` audit rows; erasure leaves no rows or history (SC-005)
- [X] T006 [P] pgTAP audit `supabase/tests/lists_audit.test.sql`: each create/update/delete writes one `audit_events` row with the right action (`*_created`, `category_edited`, `category_moved` for `parent_id`, `*_hidden` / `*_unhidden` for `hidden`, `tag_renamed`, `payee_edited`, `*_deleted`, `*_sync_renamed`), `target_type`, `device_type`, `details.ownerId` and `{field: {before, after}}` (SC-006)

### Domain schemas (packages/core)

- [X] T007 [P] Implement `CategoryCreateFields` / `CategoryUpdateFields` in `packages/core/src/categories/schemas.ts`, `TagFields` in `tags/schemas.ts`, `PayeeCreateFields` / `PayeeUpdateFields` (money as `MinorString`, date as `IsoDate` from R2) in `payees/schemas.ts`, `MergeFields` in `sync/schemas.ts`, plus read models `CategoryView`, `TagView`, `PayeeView` with `bigint` money — passes T004
- [X] T008 Register entities in `packages/core/src/sync/schemas.ts`: `SYNC_ENTITIES` gains `category`, `tag`, `payee`; `CHANGE_KINDS` gains `merge` (allowed only for the three new entities); `FIELD_SCHEMAS` and `ALLOWED_KINDS` per contracts/sync-protocol.md; `PullResponse.rows` gains the three arrays — passes T004

### Database (supabase/migrations)

- [X] T009 Migration `<ts>_lists_enums.sql`: types `public.category_kind` (`expense`, `income`), `public.payee_kind` (`business`, `person`), `public.categories_start` (`suggested`, `empty`); the 20 audit actions of research R3-14; `audit_events.target_type` check gains `category`, `tag`, `payee`
- [X] T010 Migration `<ts>_lists_tables.sql`: `public.categories`, `public.tags`, `public.payees` exactly as data-model.md (synced-table columns; name checks "1–40" / "1–30" / "1–60 chars after trimming"; `state in ('active','deleted')`; `unique (id, user_id, kind)` on categories and composite FK `(parent_id, user_id, kind)`; payee composite FK `(default_category_id, user_id) → categories (id, user_id)` (add `unique (id, user_id)`); partial unique name indexes per data-model.md; `opening_balance_minor between -999999999999 and 999999999999`; payee kind checks; `char_length(notes) <= 500`; colour in the 12 keys and icon in the 48 keys mirrored from `packages/core/src/appearance/icons.ts`; `merged_into` self-FKs); RLS select-own with `app.is_active_user()`; grant select only; triggers `sync.stamp_row` and `audit.capture_record_change('category'|'tag'|'payee')`
- [X] T011 Migration `<ts>_lists_audit.sql`: extend `audit.capture_record_change` for the new families (action derivation per research R3-14, reading `kind` from `app.change_context`) — passes T006
- [X] T012 Migration `<ts>_lists_rules.sql`: `app.category_has_activity(uuid)` and `app.payee_has_activity(uuid)` returning `false`, `app.tag_usage_count(uuid)` returning `0` (R4 replaces; comment says so), `app.person_balance_minor(uuid)` (opening balance; executable by `service_role` only); none executable by `authenticated`
- [X] T013 Migration `<ts>_lists_apply.sql`: `app._free_category_name`, `app._free_tag_name`, `app._free_payee_name`; appliers `app._apply_category`, `app._apply_tag`, `app._apply_payee` for `create` / `update` / `delete` (R2 pattern: idempotency via `applied_changes`, `auth.uid()` scoping, per-field merge with `app.merge_field_versions`, `onNameConflict`, limits 500 / 500 / 2,000 → `LIMIT_REACHED`); extend `app._apply_one` dispatch; `merge` returns `rejected` / `VALIDATION_FAILED` until US5; revoke the helpers from clients — passes T005
- [X] T014 Migration `<ts>_lists_pull.sql`: extend `app.pull_changes` with `categories`, `tags`, `payees` rows (camelCase, money as text, deleted rows included)
- [X] T015 Migration `<ts>_lists_erasure.sql`: extend `app.scrub_user_from_audit` to delete `category`/`tag`/`payee` audit rows owned by the erased user — passes T005
- [X] T016 Run `pnpm db:types` (regenerate `packages/db/src/types.gen.ts`) and `pnpm db:test` (T005, T006 green)

### Data access and the web push path

- [X] T017 [P] Repositories `packages/db/src/repositories/lists.ts`: `listCategories`, `listTags`, `listPayees` (RLS client; exclude `deleted`; money read as text → `bigint`), exported from `packages/db/src/index.ts`; `pullChanges` in `repositories/sync.ts` maps the new row arrays (camelCase, money strings, no `user_id`)
- [X] T018 [P] Extend `apps/web/lib/sync-client.ts` change builders: `createCategory`, `updateCategory`, `deleteCategory`, `mergeCategory(sourceId, targetId)` and the same for tags and payees
- [X] T019 [P] Extend `apps/web/app/api/sync/push/push.int.test.ts` and `pull/pull.int.test.ts`: a category, a tag and a payee pushed and pulled back with field versions; money as strings; another user's rows never pulled; a rejected push's log output contains no names, notes or balances (FR-029, SC-006)

**Checkpoint**: Foundation ready — schemas tested, tables with RLS and audit, appliers for create /
update / delete, web can push the new entities.

---

## Phase 3: User Story 1 - Organise spending and income into nested categories (Priority: P1) 🎯 MVP

**Goal**: Categories screen with the start choice, Expense and Income trees, add / rename / recolour
/ move, search and the shared picker.

**Independent Test**: Asha keeps "Start with suggested categories", adds Education › Kids › Swimming
classes, renames "Eating out" to "Restaurants", moves "Pets" to the top level; the picker shows
"Education › Kids › Swimming classes".

### Tests for User Story 1

- [X] T020 [P] [US1] Unit tests `packages/core/test/category-tree.test.ts`: `buildCategoryTree` sorts alphabetically ignoring case at every level, splits Expense / Income, computes effective hidden (hidden ancestor hides descendants); `categoryPath` "A › B › C"; `searchCategories` substring match at any level returning paths, hidden excluded unless asked; `canMoveCategory` refuses self, descendants, other kind and same-named siblings
- [X] T021 [P] [US1] Unit test `packages/core/test/default-categories.test.ts`: `DEFAULT_CATEGORIES` matches the spec's table (14 expense parents with listed children, 8 income), names unique among siblings, every colour/icon key valid, passes `CategoryCreateFields`
- [X] T022 [P] [US1] pgTAP `supabase/tests/lists_apply.test.sql` (categories part): create with parent of same kind; parent of other kind or other user → `INVALID_MOVE`; move under own descendant → `INVALID_MOVE`; move next to a same-named sibling → `NAME_TAKEN`; sibling rename clash → `NAME_TAKEN`, `"suffix"` → `renamed` " (2)"; same name under different parents allowed; `kind` in an update → rejected; 501st category → `LIMIT_REACHED`
- [X] T023 [P] [US1] pgTAP `supabase/tests/lists_start.test.sql`: `app.start_categories('suggested', defaults)` inserts the tree once and sets `categories_start`; a second call (either choice) adds nothing and returns the first choice; `'empty'` adds nothing; "add suggested" after `'empty'` with zero categories adds them; with any category present adds nothing; never touches another user (rules 5, 6; SC-008)
- [X] T024 [P] [US1] Integration test `apps/web/app/api/categories/start/start.int.test.ts`: `POST` with `suggested` → `200 { choice, added }` with `added` equal to the size of `DEFAULT_CATEGORIES` (74: 64 expense, 10 income); two concurrent requests → one copy only; `empty` then `suggested` → stored choice `empty`, `added` 0 unless no categories exist; rate limit; unauthenticated → 401; captured log output on success and failure contains no category names (FR-029)
- [X] T025 [P] [US1] Playwright `apps/web/e2e/r3-us1-categories.spec.ts` covering spec US1 scenarios 1–7 and quickstart S1-a … S1-d, including the start dialog opened from a picker; adding a sub-category completes within 30 s (SC-001)

### Implementation for User Story 1

- [X] T026 [P] [US1] Implement `DEFAULT_CATEGORIES` in `packages/core/src/categories/defaults.ts` (spec "Default categories" tables; colours and icons per research R3-09) — passes T021
- [X] T027 [US1] Implement `buildCategoryTree`, `categoryPath`, `searchCategories`, `canMoveCategory` in `packages/core/src/categories/tree.ts`, `search.ts`, `rules.ts` — passes T020
- [X] T028 [US1] Extend `app._apply_category` in a new migration `<ts>_categories_tree.sql` with the parent checks (same user and kind via the composite FK, cycle check with a recursive CTE → `INVALID_MOVE`, sibling name on move → `NAME_TAKEN`) — passes T022
- [X] T029 [US1] Migration `<ts>_start_categories.sql`: `user_preferences.categories_start` column (no client update grant); `app.start_categories(p_choice, p_defaults)` per research R3-06 (SECURITY DEFINER, advisory lock, first wins, validates defaults, inserts with `app.device_type`); `GET /api/me` repository read includes it — passes T023
- [X] T030 [US1] Implement `POST /api/categories/start` in `apps/web/app/api/categories/start/route.ts` (R1 `route()` wrapper, body `{ choice }`, passes `DEFAULT_CATEGORIES` from core, rate limit 10/min/user in `apps/web/lib/rate-limit.ts`); `packages/core/src/schemas/me.ts` gains `categoriesStart` — passes T024
- [X] T031 [P] [US1] Component `apps/web/components/lists/CategoryPicker.tsx`: labelled combobox, search by any part of a name, results with full path grouped Expense / Income, hidden excluded unless selected, `kind` filter prop, keyboard operable (R4 reuses it); when the user has not made the start choice (`categoriesStart` null) opening the picker first shows the shared start dialog (`apps/web/components/lists/StartCategoriesDialog.tsx`, also used by T034) — FR-007
- [X] T032 [P] [US1] Components `apps/web/components/lists/CategoryTree.tsx` (disclosure rows, colour/icon, hidden badge, row actions menu) and `CategoryForm.tsx` (name, colour, icon; new sub-category defaults to the parent's colour and icon)
- [X] T033 [P] [US1] Component `apps/web/components/lists/MoveCategoryDialog.tsx` using `CategoryPicker` with `canMoveCategory` (top level of the same kind offered; invalid targets left out) 
- [X] T034 [US1] Page `apps/web/app/(app)/settings/categories/page.tsx`: start-choice dialog (blocking until answered, suggested preselected), two trees with search, add top-level / sub-category, edit, move, "Add suggested categories" while empty; writes via sync client; link from `apps/web/app/(app)/settings/page.tsx` under a "Lists" section
- [X] T035 [US1] Run T025 and fix until green

**Checkpoint**: Categories usable end to end on the web.

---

## Phase 4: User Story 2 - Keep payees, with a default category (Priority: P1)

**Goal**: Payee list and form (business), search, default category via the picker.

**Independent Test**: Asha adds "Fresh Mart" (default Food & groceries › Groceries, a note) and
"City Power Board"; both listed with their defaults; "fresh mart" is refused.

### Tests for User Story 2

- [X] T036 [P] [US2] pgTAP `supabase/tests/lists_apply.test.sql` (payees part): create business with default category; default category of another user → `VALIDATION_FAILED`; name clash ignoring case → `NAME_TAKEN` / `renamed`; business with opening balance → rejected; 2,001st payee → `LIMIT_REACHED`
- [X] T037 [P] [US2] Playwright `apps/web/e2e/r3-us2-payees.spec.ts` covering spec US2 scenarios 1–4 (incl. the default category showing its new path after a rename); adding a payee with a default category completes within 30 s (SC-001)

### Implementation for User Story 2

- [X] T038 [US2] Complete the business rules in `app._apply_payee` (default category ownership, kind checks) in migration `<ts>_payees_rules.sql` — passes T036
- [X] T039 [P] [US2] Components `apps/web/components/lists/PayeeList.tsx` (search as you type, kind filter All / Businesses / People, "Show hidden") and `PayeeForm.tsx` (kind, default category via `CategoryPicker`, notes; person fields shown only for Person)
- [X] T040 [US2] Pages `apps/web/app/(app)/settings/payees/page.tsx`, `new/page.tsx`, `[id]/page.tsx`; name-taken message suggests the existing payee with a link
- [X] T041 [US2] Run T037 and fix until green

**Checkpoint**: Payees usable; categories and payees work independently.

---

## Phase 5: User Story 3 - Track what I owe people and what they owe me (Priority: P1)

**Goal**: Person payees with opening balance and direction, the People screen in the main
navigation with two totals, and the per-person net-worth switch on the accounts summary.

**Independent Test**: Ravi "owes you ₹15,000.00", Meera "you owe ₹4,500.00", totals ₹15,000.00 /
₹4,500.00; switching Ravi into net worth raises Owned and Net worth by ₹15,000.00 with a People line.

### Tests for User Story 3

- [X] T042 [P] [US3] Create shared vectors `packages/core/test/vectors/people.json` (zero → settled; they owe 1500000; you owe −450000; maximum ±999999999999; hidden person with balance; merged people summed) and tests `packages/core/test/people.test.ts` for `personBalance`, `peopleTotals`, `personLabel` (SC-004)
- [X] T043 [P] [US3] Extend `packages/core/test/vectors/balances.json` and `accounts-summary.test.ts` with people: included owes-you adds to Owned, included you-owe adds to Owed, excluded people change nothing, the People line equals the included sums (FR-020)
- [X] T044 [P] [US3] pgTAP `supabase/tests/lists_apply.test.sql` (people part): person create needs a date; future date → `DATE_IN_FUTURE`; person → business with non-zero balance → `BALANCE_NOT_ZERO`, at zero → applied with `opening_balance_minor`, `opening_balance_date` and `include_in_net_worth` cleared; business → person starts at 0 with a date
- [X] T045 [P] [US3] Parity: extend `apps/web/lib/sync-parity.int.test.ts` to run `vectors/people.json` against `app.person_balance_minor`
- [X] T046 [P] [US3] Playwright `apps/web/e2e/r3-us3-people.spec.ts` covering spec US3 scenarios 1–6 and quickstart S3-a … S3-c; extend `apps/web/e2e/us7-hide-balances.spec.ts` `SCREENS_WITH_AMOUNTS` with `/people` and `/settings/payees`

### Implementation for User Story 3

- [X] T047 [P] [US3] Implement `personBalance`, `peopleTotals`, `personLabel` in `packages/core/src/people/` — passes T042
- [X] T048 [US3] Extend `summarise` in `packages/core/src/accounts/summary.ts` with the optional `people` input and `people` result line (research R3-08) — passes T043
- [X] T049 [US3] Person rules in `app._apply_payee` (date not after today in the user's timezone; person → business only when `app.person_balance_minor` = 0, clearing `opening_balance_minor`, `opening_balance_date` and `include_in_net_worth`; business → person) in migration `<ts>_people_rules.sql` — passes T044, T045
- [X] T050 [P] [US3] Components `apps/web/components/lists/PeopleTotals.tsx` and `PersonRow.tsx` (balance via `<Money>` with "owes you" / "you owe" / "settled")
- [X] T051 [US3] Pages `apps/web/app/(app)/people/page.tsx` (totals, list, hidden section, empty state, "Add person"), `new/page.tsx`, `[id]/page.tsx` (reusing `PayeeForm` in person mode: amount with direction radios, date, include in net worth, default category, notes)
- [X] T052 [US3] Add People after Accounts in `apps/web/components/shell/nav-items.ts`; update `apps/web/e2e/us5-shell.spec.ts` (People entry, not a placeholder) and the keyboard-order test in `apps/web/e2e/a11y.spec.ts`
- [X] T053 [US3] Accounts page `apps/web/app/(app)/accounts/page.tsx` loads included people and passes them to `summarise`; `apps/web/components/accounts/NetWorthSummary.tsx` shows the People line when non-empty
- [X] T054 [US3] Run T046 and fix until green

**Checkpoint**: People screen and net-worth switch work; all P1 stories done.

---

## Phase 6: User Story 4 - Tag anything with free-form labels (Priority: P2)

**Goal**: Tag list with create, rename, merge and delete.

**Independent Test**: "Goa trip" renamed to "Goa trip 2026"; "Diwali" merged into "Diwali 2026";
two tags remain.

### Tests for User Story 4

- [X] T055 [P] [US4] pgTAP `supabase/tests/lists_apply.test.sql` (tags part): create, rename, clash → `NAME_TAKEN` / `renamed`, delete, 501st → `LIMIT_REACHED`
- [X] T056 [P] [US4] Playwright `apps/web/e2e/r3-us4-tags.spec.ts` covering spec US4 scenarios 1–3 (merge relies on US5's tag merge; mark that step `test.fixme` until T063 lands, then enable)

### Implementation for User Story 4

- [X] T057 [US4] Component `apps/web/components/lists/TagList.tsx` (alphabetical, add, inline rename, delete with confirmation showing usage count from `app.tag_usage_count` — 0 in R3) and page `apps/web/app/(app)/settings/tags/page.tsx`
- [X] T058 [US4] Run T055, T056 and fix until green

**Checkpoint**: Tags usable.

---

## Phase 7: User Story 5 - Clean up: hide, merge and delete (Priority: P2)

**Goal**: Hide/unhide categories and payees, merge categories (recursive), payees and tags, delete
with the rules.

**Independent Test**: Tuition & classes hidden from pickers; "FreshMart" merged into "Fresh Mart";
never-used "Pets" deleted with its payee default cleared.

### Tests for User Story 5

- [X] T059 [P] [US5] Unit tests `packages/core/test/category-merge.test.ts` for `canMergeCategory` and `mergePreview` (sub-categories moving, clashes merging recursively, payee defaults repointed — counts match the server)
- [X] T060 [P] [US5] pgTAP `supabase/tests/lists_merge.test.sql`: category merge moves children, merges same-named children recursively (three levels), repoints payee defaults, marks the source deleted with `merged_into`, each touched row gets a new `server_seq` and a history row; merge into own descendant, other kind, deleted or other user's target → `INVALID_MERGE` / `NOT_FOUND`; payee merge appends notes (capped 500), sums people's opening balances keeping the earlier date, keeps the target's switch; business↔person merge → `INVALID_MERGE`; tag merge; replayed merge change → `duplicate`, applied once (SC-003)
- [X] T061 [P] [US5] pgTAP `supabase/tests/lists_apply.test.sql` (delete part): category with children → `HAS_SUBCATEGORIES`; with activity (stub `category_has_activity` true) → `HAS_ACTIVITY`; delete clears payee defaults (each payee audited); payee with activity → `HAS_ACTIVITY`; hide/unhide recorded as `*_hidden` / `*_unhidden`
- [X] T062 [P] [US5] Playwright `apps/web/e2e/r3-us5-cleanup.spec.ts` covering spec US5 scenarios 1–6 and quickstart S5-a … S5-c

### Implementation for User Story 5

- [X] T063 [US5] Migration `<ts>_lists_merge.sql`: `app._merge_category` (recursive), `app._merge_payee`, `app._merge_tag` per research R3-05, called from the appliers for `kind = merge`, change context `kind = merge` with source and target; repoint registry comment for R4 — passes T060
- [X] T064 [US5] Delete rules in the appliers (`HAS_SUBCATEGORIES`, `HAS_ACTIVITY`, clearing payee defaults) in migration `<ts>_lists_delete.sql` — passes T061
- [X] T065 [US5] Implement `canMergeCategory`, `mergePreview` in `packages/core/src/categories/rules.ts` and a payee equivalent in `packages/core/src/payees/rules.ts` — passes T059
- [X] T066 [P] [US5] Component `apps/web/components/lists/MergeDialog.tsx` (target via `CategoryPicker` or a payee/tag search; preview of what moves; confirmation) and `DeleteDialog.tsx` (allowed: confirmation with payee-default count; not allowed: explanation offering Hide or Merge)
- [X] T067 [US5] Wire Hide/Unhide, Merge and Delete into the category tree, payee and person pages, and the tag list; enable the tag-merge step in T056
- [X] T068 [US5] Run T062 and fix until green

**Checkpoint**: All web stories complete.

---

## Phase 8: User Story 6 - Offline on Android (Priority: P3)

**Server side (now)**

- [X] T069 [P] [US6] Integration test in `apps/web/app/api/sync/pull/pull.int.test.ts` (or a new `lists-sync.int.test.ts`): two `FakeDevice`s create the same payee, tag and sibling category offline → second `renamed` " (n)"; per-field merge on a payee edited on both; a merge pushed twice → applied once; an edit to a merged source → `NOT_FOUND`; pull pages return moved children and repointed payees after a merge (SC-009 server side)

**Android client (Deferred)**

- [ ] T070 [US6] *Deferred* Local store tables for categories, tags, payees in `apps/mobile/src/lib/sync/store.ts` (extends R2's T060)
- [ ] T071 [US6] *Deferred* Android screens: People tab, Categories / Payees / Tags under settings, start choice when online
- [ ] T072 [US6] *Deferred* Offline create/edit/move/hide; merge and delete queued and reported if refused (FR-033)

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T073 [P] Accessibility: extend `apps/web/e2e/a11y.spec.ts` to `/people`, `/people/new`, `/settings/categories` (tree and start dialog), `/settings/payees`, `/settings/tags`, the picker and merge dialog (axe WCAG 2.1 AA at 1280 and 390 px; keyboard: tree disclosure, picker, move dialog)
- [X] T074 [P] Performance: `apps/web/e2e/r3-performance.spec.ts` (skipped unless `E2E_PRODUCTION=1`) seeding 500 categories and 2,000 payees; Categories and Payees within 2 s, picker/search matches within 1 s (SC-002)
- [X] T075 [P] Demo data `packages/core/src/demo/lists.ts` per research R3-15 with a unit test `packages/core/test/demo-lists.test.ts` (deterministic, passes schemas, exercises every label and the net-worth switch); extend `apps/web/e2e/helpers/db.ts` with `seedLists(email, …)` used by T073, T074
- [X] T076 Write `specs/003-categories-tags-payees/review-notes.md`: `apply_changes` extensions (scoping, cycle check, merges and the repoint registry R4 must extend), `start_categories`, RLS/grants, `person_balance_minor` + `summarise` people inclusion, erasure extension, API route
- [X] T077 Run all suites (core, db, web unit, integration, pgTAP, full e2e, production performance, typecheck, lint) and record results in `specs/003-categories-tags-payees/validation.md`, mapping quickstart rows to tests
- [X] T078 Converge: update contracts with deviations found during implementation; set R3 status in `ROADMAP.md`; note Story 6's Android client (T070–T072) is carried into the Android phase

### Converge notes (2026-10-30) — how the build differs from the tasks above

- Migrations are consolidated into eight files `20261028000001…08_*` (enums, tables, audit,
  rules, apply incl. tree/people/merge/delete rules, start_categories, pull, erasure) instead of the
  follow-up migrations listed per story (T028, T038, T049, T063, T064); nothing was deployed between
  them.
- `app.start_categories` takes a third parameter `p_device` (contracts/database.md updated).
- The taxes icon is `scale`, not `landmark` (which already draws the bank icon); research R3-09.
- Core people logic lives in `packages/core/src/people/index.ts` (one file); category merge/delete
  rules (`canMergeCategory`, `mergePreview`, `canDeleteCategory`) are in `categories/rules.ts`.
- UI components differ in name and split from T031–T033, T039, T050, T066 (see
  contracts/client-lists.md § As built): merge and delete live in `CategoryActions` (categories),
  `PayeeManage` (payees and people) and `TagList` (tags) rather than shared `MergeDialog` /
  `DeleteDialog` components.
- Found during validation and fixed: list repositories page past the API's 1,000-row limit
  (users with more than 1,000 payees saw half), with a regression test; the Payees list renders 200
  rows at a time; the shared `Dialog` is portalled (a nested form caused a page reload); the picker's
  suggestions are in the page flow and its "no matches" message is outside the listbox (axe).
- Relocate stays in R4 (owner, 2026-10-27).

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** → stories.
- **US1** first (MVP; its `CategoryPicker` is used by US2, US3, US5).
- **US2** after US1 (default category picker). **US3** after US2 (person mode of the payee form).
- **US4** needs only Phase 2 (its merge step waits for T063).
- **US5** after US1–US4 (acts on all three entities).
- **US6 server side** after US5 (merges). Android client deferred.
- **Polish** last.

### Parallel opportunities

- Phase 1: T001, T002 in parallel; T003 after T002.
- Phase 2: tests T004–T006 in parallel; T007 then T008; migrations in order T009 → T015; T017–T019
  in parallel after T016.
- Within each story, the [P] tests run together first; [P] components in parallel.

## Implementation Strategy

1. Setup + Foundational; run pgTAP and core tests.
2. US1 (MVP) — categories with the start choice; demo it.
3. US2, then US3 (People and the net-worth switch) — all P1 done.
4. US4 tags; US5 clean-up.
5. US6 server side; Polish (a11y, performance, demo data, review notes, validation, converge); PR.
   Android client tasks stay open for the Android phase.

## Notes

- Relocate is **not** in R3 (owner, 2026-10-27) — R4 adds it with transactions.
- Every merge and delete rule is decided on the server; client checks only shape the UI.
- No names, notes or amounts in logs (FR-029).
