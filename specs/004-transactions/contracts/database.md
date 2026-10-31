# Contract: Database functions and access rules (R4)

Extends R2's and R3's database contracts. All functions `set search_path = ''`.

## Callable by clients (`authenticated`)

| Function | Behaviour |
|----------|-----------|
| `app.apply_changes` (extended) | `transaction` and `person_rate` appliers; `relocate` for categories and payees; validation per contracts/sync-protocol.md; every row scoped to `auth.uid()` |
| `app.propose_interest() → int` | SECURITY DEFINER, active user, per-user advisory lock. Creates missing proposals for completed months and recomputes unedited unconfirmed proposals in month order (research R4-05). Returns how many changed. Idempotent. |
| `app.search_transactions(p_filters jsonb, p_after jsonb, p_limit int) → jsonb` | SECURITY INVOKER. Filtered, keyset-paged rows plus `{ count, totalMinor }` (research R4-08) |
| `app.to_confirm_count() → int` | SECURITY INVOKER. Active, unconfirmed, not void, date ≤ today |
| `app.pull_changes` (extended) | Also `transactions`, `person_rates` |

## Internal

| Function | Purpose |
|----------|---------|
| `app._apply_transaction`, `app._apply_person_rate` | Appliers |
| `app._relocate_category`, `app._relocate_payee` | Repoint transactions and lines, keep the source |
| `app._merge_category`, `_merge_payee`, `_merge_tag` (R3, extended) | Also repoint transactions, lines and tags |
| `app._rebuild_postings()` trigger | Rebuilds `app.transaction_postings` for the row |
| `app.account_balance_minor`, `app.person_balance_minor` (replaced) | Opening + counted postings |
| `app.account_has_activity`, `app.category_has_activity`, `app.payee_has_activity`, `app.tag_usage_count` (replaced) | Read transactions / postings, any state |
| `app._month_opening_balance(person, month)`, `app._interest_amount(opening, rate_e4)` | Interest maths; parity-tested with core |

## Access rules to prove

1. A cannot read B's transactions, person rates or postings (directly, via search or pull).
2. The owner-admin reads none of them.
3. No client writes to `transactions`, `person_rates`; no client access to `app.transaction_postings`.
4. Using B's account, category, payee, person or tag ids in A's transaction is rejected and changes
   nothing of B's.
5. `propose_interest` only ever creates or changes the caller's rows.
6. Disabled users get nothing; history is not client-readable; erasure removes everything.
