# Contract: Database functions (R5)

All `set search_path = ''`, SECURITY DEFINER, for `auth.uid()` only, refusing inactive users
(`USER_INACTIVE`), taking the per-user lock `sync:<user>`.

| Function | Behaviour |
|----------|-----------|
| `app.load_demo_data(p_changes jsonb, p_device text) → jsonb { counts }` | Refuses `NOT_EMPTY` when the user has any account, group, category, tag, payee, transaction or rate (deleted ones included). Applies each change with `app._apply_one`; any refusal raises `DEMO_REJECTED` and nothing is kept. Sets `categories_start = 'suggested'`. Writes `demo_data_loaded`. 1–5,000 changes. |
| `app.reset_my_data(p_device text) → jsonb { removed }` | Deletes the user's financial rows and their history (data-model.md), clears `categories_start`, upserts `private.data_resets`, writes `data_reset`. |
| `app.reset_and_load_demo(p_changes jsonb, p_device text) → jsonb` | `reset_my_data` then `load_demo_data` in one transaction. |
| `app.apply_changes` (extended) | Refuses a change whose HLC time is earlier than the user's `reset_at` with `DATA_RESET`. |
| `app.pull_changes` (extended) | When `0 < p_cursor < reset_seq`: `{ reset: true, cursor: 0, hasMore: true, rows: {} }`. |

## Access rules to prove

1. Load and reset touch only the caller's rows; another user's data and history are unchanged.
2. Load is all-or-nothing and at most once (a second call refuses `NOT_EMPTY`).
3. After reset the caller has no financial rows and none of their history; one `data_reset` entry
   remains; profile and preferences are unchanged.
4. A pull from a pre-reset cursor says `reset`; a push of a pre-reset change is refused `DATA_RESET`.
5. Clients cannot read or write `private.data_resets`.
