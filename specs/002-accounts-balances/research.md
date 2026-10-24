# Research: Accounts & Balances (R2)

Phase 0 decisions for [plan.md](plan.md). Numbering continues R1's research ([R-01 … R-22](../001-identity-access-shell/research.md))
with an `R2-` prefix. Versions are verified at implementation, as in R1 (R-17).

## R2-01 Offline sync engine (constitution: chosen in R2's plan, reused by all modules)

**Decision**: An **in-house change-log sync** on top of Expo's bundled **expo-sqlite**, with the
server side written as Postgres functions reached through the existing Next.js API (R-07):

- The phone keeps a local SQLite copy of the user's synced tables plus an outbox of
  `pending_changes`. Every user action writes the local row and appends a change (a client-made
  UUID, the entity, the changed fields, and a hybrid-logical-clock time — R2-02) in one local
  transaction, so the screen updates at once and nothing is lost if the app is killed.
- **Push**: `POST /api/sync/push` sends a batch of changes; `app.apply_changes()` applies each one
  under the merge rule (R2-02), exactly once (R2-03), and returns a per-change result.
- **Pull**: `GET /api/sync/pull?cursor=` returns the user's rows changed since the cursor (R2-04);
  the phone overwrites its copy with them (server state is authoritative after merge).
- The web uses the **same push endpoint** for its writes (R2-05), so web and Android follow one set
  of rules, one validation path and one audit path.
- The protocol is entity-generic: R3/R4 add entities (categories, payees, transactions) by
  registering them with `apply_changes()` and the pull query; no new transport is built.

**Rationale**:
- Implements the clarified conflict rule exactly (per field, latest edit wins — FR-030), which
  record-level engines do not do out of the box.
- No extra hosted service: stays inside Supabase + Vercel free tiers (Principle XI) and keeps RLS
  plus our audit triggers as the single enforcement point (Principles I, III).
- expo-sqlite ships with Expo (no extra native module to keep compatible with each SDK release);
  2026 guidance recommends it for most apps.
- Household scale (< 20 users, hundreds to a few thousand records each) needs no streaming
  replication; batch push/pull is enough.

**Alternatives considered**:
- **PowerSync** (managed Postgres→SQLite sync): mature Expo SDK, but the free plan deactivates
  projects after **1 week without activity** (the demo has quiet weeks → a second keep-alive and a
  second service to operate); Pro is $49/month (violates XI). Uploads and conflict handling are
  still written by us, so it would only replace the pull side.
- **WatermelonDB** + custom sync endpoints: record-level "latest change wins" with local-column
  preference; the official changelog's last Expo fix is from January 2023 and current SDKs rely on
  community config plugins; the server half must still be written by us.
- **Supabase Realtime only**: online-only, no offline queue — fails Principle IV.
- **RxDB / TinyBase / Legend-State plugins**: extra client frameworks whose Supabase replication
  semantics (record-level, or paid premium plugins) do not match FR-030 without customisation.

Sources: [PowerSync pricing](https://powersync.com/pricing),
[PowerSync usage & billing](https://docs.powersync.com/resources/usage-and-billing),
[WatermelonDB changelog](https://watermelondb.dev/docs/CHANGELOG),
[Supabase: offline-first with WatermelonDB](https://supabase.com/blog/react-native-offline-first-watermelon-db),
[Expo: synced in-app SQLite](https://expo.dev/blog/what-synced-in-app-sqlite-brings-to-expo-apps),
[Expo: using Supabase](https://docs.expo.dev/guides/using-supabase/),
[expo-sqlite vs WatermelonDB (2026)](https://www.pkgpulse.com/guides/expo-sqlite-vs-watermelondb-vs-realm-react-native-local-2026).

**Risk & exit**: the protocol is small and documented in [contracts/sync-protocol.md](contracts/sync-protocol.md);
replacing it later requires a constitution amendment (Technology Constraints), as planned.

## R2-02 Conflict rule: per-field last-writer-wins with hybrid logical clocks (FR-030, clarified)

**Decision**: Every synced row stores `field_versions` — a JSON map from field name to the
**HLC timestamp** of the change that last set it. A change carries one HLC for all fields it sets.
`apply_changes()` writes a field only if the change's HLC is greater than the stored one (ties
broken by device id, then change id, so the outcome is the same on every server replay). Fields a
change does not mention are untouched, so edits to different fields combine.

- **HLC** (hybrid logical clock): `wallMillis.counter.deviceId`, monotonic per device and advanced
  past any HLC the device has pulled, so a device that has seen an edit always orders its own next
  edit after it.
- **Clock skew guard**: the server clamps a change's wall time to at most *server receive time + 5
  minutes* before comparing, so a phone with a clock far in the future cannot win every later
  conflict. The clamp is recorded in the change result.
- **Lifecycle wins over edits**: archive/delete are applied as field changes to `state` with the
  same rule, and an edit arriving for an archived/deleted row changes stored fields but never
  revives the row (FR-030: "an archive or delete wins over an edit made elsewhere").
- Overwritten values remain recoverable because every applied field change is written to the audit
  history with its before value (R2-08).

**Alternatives considered**: whole-record LWW (rejected by the owner in clarification), CRDT
libraries (Automerge/Yjs — heavy for flat records), server-arrival order (would let a long-offline
phone overwrite newer edits).

## R2-03 Exactly-once application (FR-031)

**Decision**: `private.applied_changes(user_id, change_id, applied_at, result jsonb)` with primary
key `(user_id, change_id)`. `apply_changes()` inserts the key first; on conflict it returns the
stored result without re-applying. Replays after timeouts, app restarts or duplicated requests
are therefore harmless. Rows are kept for the life of the environment in Phase 1 (household
volume: a few thousand per user per year); a purge job can be added when needed.

## R2-04 Pull cursor without missed rows (FR-031, SC-007)

**Decision**: Each synced table has `server_seq bigint`, set from one global sequence by a
`BEFORE INSERT OR UPDATE` trigger. Pull returns the caller's rows with `server_seq > cursor`
ordered by `server_seq` (page size 500) and the new cursor.

A sequence cursor can skip a row whose transaction committed after a later-numbered one. To make
the order safe per user, the trigger first takes `pg_advisory_xact_lock` on the row owner's id, so
all writes to one user's synced rows are serialised; within a user, sequence order equals commit
order, and pulls (which only read that user's rows) never skip. Cost: writes by one user do not run
in parallel — irrelevant at household scale.

**Alternatives considered**: `updated_at` timestamps (clock ties and the same commit-order gap),
logical replication / Realtime (online-only, more moving parts), per-user version counters in a
separate table (same effect, more code).

## R2-05 Web write path

**Decision**: The web app writes accounts through `POST /api/sync/push` with `device = web`,
sending **only the fields the user edited**, with an HLC generated in the browser. It reads with
server components through the RLS-scoped Supabase client (`packages/db` repositories) and calls
`router.refresh()` after a successful push so balances and totals update without reload (FR-014).

**Rationale**: One merge rule for the two-tabs edge case and for offline phones; one validation
schema; one audit path with device type. Web stays online-only (Principle IV allows it).

## R2-06 Account order across two views (FR-010, clarified grouping)

**Decision**: One per-user order using **fractional index keys** (`sort_key` text; e.g. `a0`,
`a0V`, `a1`) from the small, dependency-free `fractional-indexing` algorithm (vendored into
`packages/core`, ~100 lines, MIT, with tests). Moving an account sets one field — its key between
its new neighbours — so moves sync and merge like any other field. Groups use the same scheme.
Equal keys (two devices moved different accounts to the same gap offline) are ordered by id;
the next move rewrites a key.

**Alternatives considered**: integer positions (a move rewrites many rows and conflicts badly
offline), separate orders per view (contradicts the clarified single order).

## R2-07 Balances and the net-worth summary (FR-012–FR-019, Principle II)

**Decision**: **No stored balances.** `packages/core/accounts/` computes
`currentBalance(account, movements)` (opening balance + movements on or after the opening date;
movements are empty until R4) and `summarise(accounts, view)` → per-group subtotals, Owned, Owed,
Net worth, all `bigint` paise. Credit-card balances are stored as *amount owed* (positive = owed),
others as *amount held*; the summary converts once, in one function.

A SQL function `app.account_balance_minor(account_id)` mirrors the rule for server-side checks
(archive needs ₹0.00 — FR-022). A shared set of test vectors (JSON fixture) is run against both the
TypeScript and SQL implementations so they cannot drift (Principle VII).

## R2-08 Change history and erasure (FR-027–FR-029, Principle III)

**Decision**:
- New trigger function `audit.capture_record_change()` generalising R1's `capture_change()`:
  takes the audit action family and target type, records `{field: {before, after}}` for changed
  fields (excluding `server_seq`, `field_versions`, `updated_at`), uses the row's `id` as
  `target_id`, and reads the device type from a transaction-local setting `app.device_type` that
  `apply_changes()` sets. Actions: `account_created/edited/reordered/archived/restored/deleted/sync_renamed`,
  `account_group_created/renamed/reordered/deleted`.
- Account and group history contains financial details (names, amounts), so it is readable by
  nobody through the client in R2 (no UI; undo is Phase 4) and is **deleted** — not scrubbed —
  when the user is erased: `app.scrub_user_from_audit()` gains a step deleting audit rows whose
  target type is `account`/`account_group` and whose owner is the erased user (the owner is stored
  in `details.ownerId` at capture time). Accounts, groups and `applied_changes` go by cascade with
  the auth user.
- Operational logs (`lib/api/log.ts`) receive only route, error class, status and counts — never
  change payloads (FR-028).

## R2-09 Reordering UI (FR-010)

**Decision**: **dnd-kit** (`@dnd-kit/core` + `@dnd-kit/sortable`) on the web for drag and drop with
its keyboard sensor and screen-reader announcements, plus explicit **Move up / Move down** buttons
on each row (FR-010 requires both). Android (later phase) uses long-press drag via
react-native-gesture-handler (already a dependency) plus the same buttons.

**Alternatives considered**: native HTML drag-and-drop (not keyboard accessible), buttons only
(spec requires drag and drop too).

## R2-10 Colours and icons (FR-008, Principle XIII)

**Decision**: `packages/core/accounts/appearance.ts` defines **12 colour tokens** (stored as token
keys, not hex) and ~24 **icon keys** (bank, cash, card, wallet, piggy bank, coins, …) with a default
per type. Each app maps keys to its own rendering: web → lucide-react icons, Android →
Material Symbols via expo-symbols (R1). Colours are checked for ≥ 3:1 contrast against the card
background in both themes; colour is decoration only (type and labels carry meaning).

## R2-11 Amount entry (FR-003, Principle II "convert at the boundary")

**Decision**: `parseAmountInput(text, { allowNegative })` in `packages/core/money`: accepts an
optional leading `-` or `₹`, digits with Indian **or** international separators, and at most two
decimals; returns `bigint` paise or a typed error (`TOO_MANY_DECIMALS`, `OUT_OF_RANGE`,
`NOT_A_NUMBER`). Never rounds. Range ±999,999,999,999 paise (±₹9,99,99,99,999.99). Pure string
arithmetic, tested with lakh/crore and edge inputs.

## R2-12 "Accounts view" preference (FR-009)

**Decision**: New column `user_preferences.accounts_view` (`by_type` | `my_groups`, default
`by_type`), changed through the existing `PATCH /api/me/preferences` and returned by `GET /api/me`,
so it follows the user to every device (R1 FR-025). On Android it is applied locally at once and
sent when online through the same preferences path (not the change log — it is a preference, not a
financial record).

## R2-13 Deletion vs history (FR-024, FR-034)

**Decision**: `app.account_has_activity(account_id)` returns whether any transaction has ever
referenced the account; in R2 it returns `false` (no transactions exist), and R4 replaces its body.
A delete change for an account with activity is converted to an **archive** when the balance is
₹0.00, otherwise rejected with `HAS_ACTIVITY` — the result tells the device which happened.
Deletion is soft (`state = 'deleted'`); deleted names stop blocking uniqueness.

## R2-14 Duplicate names created offline (FR-002, FR-032)

**Decision**: Uniqueness is a partial unique index on `(user_id, lower(name))` where
`state <> 'deleted'`. A create change carries `onNameConflict`: the web sends `reject` (the form
shows the error — FR-002), the phone's sync sends `suffix`, and `apply_changes()` appends the next
free ` (n)` (truncating the base so the result stays ≤ 40 characters) and returns `renamed`, which
the phone shows to the user.

## R2-15 Android client shape (delivered in the Android phase)

**Decision (recorded now so the server is built for it)**: expo-sqlite database per signed-in user
with tables mirroring `accounts`, `account_groups`, plus `pending_changes` and `sync_state(cursor,
hlc)`. Sync runs on: connectivity regained (R1 `useOffline`), app foreground, 2 s after a local
change while online, and every 5 minutes while online; push then pull. R1's wipe rules apply:
sign-out with pending changes warns (FR-033); 5 wrong PINs keeps `pending_changes` sealed and tagged
with the user id (R-09) and removes everything else.

## R2-16 Testing (Principle IX)

**Decision**:
- **Vitest (core)**: amount parsing, balance and summary vectors (zero, negative, overdrawn, in
  credit, excluded, archived, max size), fractional keys, HLC ordering and clamp, the per-field
  merge function (shared with the server tests as vectors).
- **pgTAP**: RLS isolation for `accounts`, `account_groups`, `applied_changes` (user A vs B vs
  owner); no direct writes for `authenticated`; constraints (name length/uniqueness, type-specific
  credit limit, currency = base currency, date not in future); `apply_changes` merge, idempotency,
  rename suffix, archive-at-zero, delete→archive, audit rows with device type, erasure removes
  account history.
- **Integration (Vitest, `*.int.test.ts`)**: push/pull API with two simulated devices — offline
  edits, duplicated delivery, conflicting fields, duplicate names, cursor paging.
- **Playwright**: stories 1–4 on the web, hide-balances on accounts screens, axe accessibility and
  keyboard reordering; SC-003 timing with 100 seeded accounts.
- **Jest (Android phase)**: local store + outbox + sync loop with a fake server.
