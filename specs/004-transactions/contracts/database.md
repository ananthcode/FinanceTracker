# Contract: Database functions and access rules (R4)

Extends R2's and R3's database contracts. All functions `set search_path = ''`.

## Callable by clients (`authenticated`)

| Function | Behaviour |
|----------|-----------|
| `app.apply_changes` (extended) | `transaction` and `person_rate` appliers; `relocate` for categories and payees; validation per contracts/sync-protocol.md; every row scoped to `auth.uid()` |
| `app.propose_interest() → jsonb { changed }` | SECURITY DEFINER, active user, today in the user's timezone; calls `app._propose_interest`. Creates missing proposals for completed months and recomputes unedited unconfirmed proposals in month order (research R4-05). Idempotent. |
| `app.balance_movements() → jsonb { accounts, people }` | SECURITY DEFINER, active user. Each of the caller's accounts' and people's counted postings total (text), on or after their opening dates; screens add them to opening balances (as built: one read for every balance on a screen) |
| `app.search_transactions(p_filters jsonb, p_after jsonb, p_limit int) → jsonb` | SECURITY INVOKER. Filtered, keyset-paged rows plus `{ count, totalMinor }` (research R4-08) |
| `app.to_confirm_count() → int` | SECURITY INVOKER. Active, unconfirmed, not void, date ≤ today |
| `app.pull_changes` (extended) | Also `transactions`, `person_rates` |

## Internal

| Function | Purpose |
|----------|---------|
| `app._apply_transaction`, `app._apply_person_rate` | Appliers |
| `app._relocate(user, entity, id, fields, hlc, change)` | Relocate for categories and payees: same kind, keeps the source, records `*_relocated` (as built: one function for both) |
| `app._repoint_category`, `_repoint_payee`, `_repoint_tag` | Repoint transactions and split lines (field versions bumped) |
| `app._list_row_deleted()` trigger on categories, payees, tags | R3 merges and tag delete reach transactions: a merged row's transactions follow `merged_into`; a deleted tag is removed |
| `app._propose_interest(user, today)` | The proposer; **service_role only** (parity tests choose "today") |
| `app._rebuild_postings()` trigger | Rebuilds `private.transaction_postings` for the row |
| `app.account_balance_minor`, `app.person_balance_minor` (replaced) | Opening + counted postings |
| `app.account_has_activity`, `app.category_has_activity`, `app.payee_has_activity`, `app.tag_usage_count` (replaced) | Read transactions / postings, any state |
| `app._interest_amount(opening, rate_e4)` | Interest maths (the month's opening balance is computed inside the proposer); parity-tested with core |

## Access rules to prove

1. A cannot read B's transactions, person rates or postings (directly, via search or pull).
2. The owner-admin reads none of them.
3. No client writes to `transactions`, `person_rates`; no client access to `private.transaction_postings`.
4. Using B's account, category, payee, person or tag ids in A's transaction is rejected and changes
   nothing of B's.
5. `propose_interest` only ever creates or changes the caller's rows.
6. Disabled users get nothing; history is not client-readable; erasure removes everything.
