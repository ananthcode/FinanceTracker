# Review notes: Accounts & Balances (R2)

Code the constitution requires the owner to review explicitly before merge (Development Workflow
& Quality Gates: authentication, authorization/RLS, sync and money arithmetic). Each item says
what to check and which tests prove it. Links are relative to the repository root.

## 1. The single write path — `app.apply_changes` (SECURITY DEFINER)

[supabase/migrations/20261024000006_apply_changes.sql](../../supabase/migrations/20261024000006_apply_changes.sql)

It runs with the owner's rights, so it bypasses row-level security. Check that:

- `p_user` is always `auth.uid()` (set once in `app.apply_changes`, line ~485) and never taken from
  the payload; a `userId` field is rejected (unknown field).
- Every statement on `accounts`, `account_groups` and `private.applied_changes` filters on
  `user_id = p_user` (lines 163–309, 345–414, 446, 479).
- An id belonging to another user is reported as `NOT_FOUND` (or rejected on create) before any
  read of that row (line 158).
- A group must belong to the caller (line 179) — also enforced by the composite foreign key in the
  table (item 2).
- Each change runs in its own subtransaction; only data and integrity errors and our own codes are
  turned into a per-change rejection — other errors still fail the request (lines 455–475).
- Only `apply_changes` (and the pure `merge_field_versions`) are executable by clients; the `_apply_*`
  helpers are revoked (lines 520–531).

Tests: `supabase/tests/accounts_rls.test.sql` rules 1–8, `accounts_apply.test.sql` (46),
`apps/web/app/api/sync/push/push.int.test.ts`.

## 2. Tables, RLS and grants

[supabase/migrations/20261024000004_accounts.sql](../../supabase/migrations/20261024000004_accounts.sql)

- `authenticated` has SELECT only (lines 65–66); there is no INSERT/UPDATE/DELETE path except item 1.
- Policies require `user_id = auth.uid()` and an active user (lines 68–74).
- `foreign key (group_id, user_id) → account_groups (id, user_id)` (line 54): an account can only be
  in one of its owner's groups, whatever the code does.
- `sort_key` uses the `"C"` collation (lines 11, 40) so the database orders keys exactly like the
  TypeScript `<` comparison.

Tests: `accounts_rls.test.sql` (direct writes refused, owner-admin sees nothing, disabled user sees
nothing).

## 3. Sync ordering — `sync.stamp_row`

[supabase/migrations/20261024000002_sync_infrastructure.sql](../../supabase/migrations/20261024000002_sync_infrastructure.sql)

- `pg_advisory_xact_lock` on the row owner (line 19) before `nextval` (line 20): one user's writes
  are serialised, so a pull cursor cannot skip a row that commits late (research R2-04). Cost:
  one user's writes never run in parallel.

Tests: `apps/web/app/api/sync/pull/pull.int.test.ts` — three devices pushing at once, paged pull
returns every row exactly once.

## 4. Merge rule (TypeScript and SQL)

[packages/core/src/sync/merge.ts](../../packages/core/src/sync/merge.ts),
`app.merge_field_versions` in item 1 (lines 11–48), [hlc.ts](../../packages/core/src/sync/hlc.ts).

- Per field, a strictly newer HLC wins; an identical HLC keeps the stored value; the device clock is
  capped at receive time + 5 minutes.
- Lifecycle (archive / restore / delete) is the `state` field under the same rule.

Tests: `packages/core/test/merge.test.ts` and `hlc.test.ts`; the same vectors run against SQL in
`apps/web/lib/sync-parity.int.test.ts`.

## 5. Money

[packages/core/src/money/parse.ts](../../packages/core/src/money/parse.ts),
[accounts/balance.ts](../../packages/core/src/accounts/balance.ts),
[accounts/summary.ts](../../packages/core/src/accounts/summary.ts),
[20261024000005_account_rules.sql](../../supabase/migrations/20261024000005_account_rules.sql).

- Amounts are `bigint` paise everywhere and decimal strings on the wire; `parseAmountInput` never
  rounds; repositories read money columns as text.
- No stored balances. `app.account_balance_minor` is the opening balance until R4.
- **R4 must replace** `app.account_balance_minor` (add movements) and `app.account_has_activity`
  (currently always `false`). Until then, delete is allowed for every account — correct only
  because no transactions exist yet.

Tests: `parse-amount.test.ts`, `accounts-summary.test.ts` (vectors incl. maximum values), parity
test (item 4).

## 6. Change history and erasure

[20261024000003_audit_record_change.sql](../../supabase/migrations/20261024000003_audit_record_change.sql),
[20261024000008_erasure_accounts.sql](../../supabase/migrations/20261024000008_erasure_accounts.sql).

- Every insert/update records before/after per changed field, the device type and the owner id;
  clients cannot read these rows.
- Erasure deletes (not scrubs) account and group history (it holds names and amounts), then the
  cascade removes accounts, groups and applied changes.

Tests: `accounts_audit.test.sql` (19), `accounts_rls.test.sql` rule 8.

## 7. API routes

[apps/web/app/api/sync/push/route.ts](../../apps/web/app/api/sync/push/route.ts),
[pull/route.ts](../../apps/web/app/api/sync/pull/route.ts).

- R1 route wrapper: auth, CSRF origin rule, Zod shape check (whole push refused with 400).
- `device` must match how the request signed in (cookie = web, bearer = android).
- Rate limits: 60 pushes and 60 pulls per minute per user; logs carry no payload (FR-028,
  `lib/api/log.test.ts`).
