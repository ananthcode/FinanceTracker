# Review notes: Categories, Tags & Payees (R3)

Code the constitution requires the owner to review explicitly before merge (Development Workflow
& Quality Gates: authorization/RLS, sync and money). Each item says what to check and which tests
prove it. Links are relative to the repository root.

## 1. Writes through `app.apply_changes` (SECURITY DEFINER) — new appliers and merges

[supabase/migrations/20261028000005_lists_apply.sql](../../supabase/migrations/20261028000005_lists_apply.sql)

The appliers run inside R2's `app.apply_changes`, which bypasses row-level security. Check that:

- Each applier refuses an id that belongs to another user before reading it (lines 247, 410, 528)
  and every statement filters on `user_id = p_user` (= `auth.uid()`).
- A parent (lines ~255–266), a default category (payee applier) and a merge target (lines ~350,
  ~465, ~650) must be the caller's own live rows; anything else is `INVALID_MOVE`,
  `VALIDATION_FAILED`, `NOT_FOUND` or `INVALID_MERGE`.
- Moves cannot create cycles: the new parent may not be in the category's own subtree
  (`app._category_subtree`, line 323); merges may not target the source's subtree (line 357).
- Merges (`app._merge_category` line 113, `_merge_payee` 152, `_merge_tag` 197) repoint every
  reference in one transaction and soft-delete the source with `merged_into`; each touched row gets
  its own history row and a new `server_seq`.
- **R4 must extend the merge functions** where marked (lines 138, 167, 204): transactions, split
  lines, transaction tags and person-ledger movements must be repointed too, and
  `app.category_has_activity` / `app.payee_has_activity` / `app.tag_usage_count`
  ([20261028000004_lists_rules.sql](../../supabase/migrations/20261028000004_lists_rules.sql)) must
  be replaced. Until then delete is allowed for every leaf category and every payee — correct only
  because no transactions exist.
- All helpers are revoked from clients (lines 750–761).

Tests: `supabase/tests/lists_rls.test.sql` (21), `lists_apply.test.sql` (45), `lists_merge.test.sql`
(24), `apps/web/app/api/sync/lists-sync.int.test.ts`.

## 2. Tables, RLS and grants

[supabase/migrations/20261028000002_lists_tables.sql](../../supabase/migrations/20261028000002_lists_tables.sql)

- RLS on all three tables (lines 100–102); `authenticated` gets SELECT only (line 104) through
  own-rows policies for active users (lines 106–117).
- Composite foreign keys make the database itself keep a parent in the same user **and** kind
  (line 35), a default category within the same user (line 91) and a merge target within the same
  user (lines 36, 59, 92).
- A business can never carry a balance or count in net worth; a person always has a date
  (lines 88–90).

Tests: `lists_rls.test.sql` (direct writes refused, owner-admin and disabled users see nothing).

## 3. `app.start_categories` (SECURITY DEFINER) — the one-time start choice

[supabase/migrations/20261028000006_start_categories.sql](../../supabase/migrations/20261028000006_start_categories.sql)

- Scoped to `auth.uid()`; takes the same per-user advisory lock as `sync.stamp_row` (line 36), so
  two devices answering at once cannot both insert the defaults; the first answer is kept (line 39);
  defaults are inserted only while the user has no categories (line 48).
- The default list is passed by the API route from `packages/core`; a client calling the function
  directly can only add categories to its own account, validated by the table checks.
- `user_preferences.categories_start` (line 8) is not in R1's client update grants, and
  `PATCH /api/me/preferences` rejects it.

Tests: `lists_start.test.sql` (12, incl. a direct client update refused), `apps/web/app/api/categories/start/start.int.test.ts` (6, incl.
two concurrent requests).

## 4. Money: person balances and the net-worth switch

[packages/core/src/people/index.ts](../../packages/core/src/people/index.ts),
[packages/core/src/accounts/summary.ts](../../packages/core/src/accounts/summary.ts),
[20261028000004_lists_rules.sql](../../supabase/migrations/20261028000004_lists_rules.sql).

- Opening balances are `bigint` paise, signed (positive = the person owes the user), parsed with
  R2's `parseAmountInput` (never rounded), never stored as a running balance.
- `personBalance` and `app.person_balance_minor` run the same vectors (`vectors/people.json`,
  parity test). The server refuses person → business unless the balance is ₹0.00.
- `summarise` adds only people with the switch on to Owned / Owed and reports the People line, so
  the figures still add up (`accounts-summary.test.ts`).
- Merging two people adds their opening balances exactly (`lists_merge.test.sql`).

## 5. History and erasure

[20261028000003_lists_audit.sql](../../supabase/migrations/20261028000003_lists_audit.sql),
[20261028000008_lists_erasure.sql](../../supabase/migrations/20261028000008_lists_erasure.sql).

- Every insert/update records before/after per field, device type and owner; the action names
  moves, hides, merges and deletes. Clients cannot read these rows.
- Erasure deletes category, tag and payee history (it holds names, notes and balances).

Tests: `lists_audit.test.sql` (14), `lists_rls.test.sql` rule 8.

## 6. Data access and API

- [packages/db/src/repositories/lists.ts](../../packages/db/src/repositories/lists.ts): reads use the
  caller's client (RLS) and page past the API's 1,000-row limit (regression test
  `apps/web/lib/lists-repository.int.test.ts`).
- [apps/web/app/api/categories/start/route.ts](../../apps/web/app/api/categories/start/route.ts):
  R1 route wrapper (auth, CSRF, Zod), rate limit 10/min/user; logs carry no names (test).
- Push and pull accept the new entities through R2's routes unchanged.
