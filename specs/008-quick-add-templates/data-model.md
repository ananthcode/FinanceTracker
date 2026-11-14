# Data Model: Quick-add Templates (R8)

## Enums and vocabulary

| Name | Values |
|------|--------|
| `public.audit_action` (added) | `template_created`, `template_edited`, `template_deleted`, `template_hidden`, `template_unhidden`, `template_reordered` |
| `audit_events.target_type` (added) | `template` |

## Entity: Template — `public.transaction_templates` (synced)

| Field | Type | Rules |
|-------|------|-------|
| `id` | `uuid` | Client-generated |
| `user_id` | `uuid` | Owner |
| `name` | `text` not null | 1–40 chars, trimmed; unique among live templates ignoring case (`NAME_TAKEN`) |
| `kind` | `transaction_kind` not null | `expense`, `income`, `refund`, `transfer`, `person`; create-only |
| `flow` | `money_flow` not null | Derived from kind and person action (R4 `_flow_of`) |
| `account_id` | `uuid` not null | The user's account (composite FK) |
| `to_account_id` | `uuid` null | Transfers only; differs from `account_id` |
| `amount_minor` | `bigint` null | 1 … 999999999999, or null ("amount each time"); required when `lines` is not empty |
| `payee_id` | `uuid` null | Optional business payee; required person for `person` |
| `person_action` | `person_action` null | `person` only; not `adjustment` |
| `category_id` | `uuid` null | Categorised kinds only, no split; matching kind |
| `lines` | `jsonb` not null default `[]` | R4 split lines; 2–50; add up to `amount_minor`; share its field version |
| `tag_ids` | `uuid[]` not null default `{}` | ≤ 20, the user's tags |
| `notes` | `text` null | ≤ 1000 chars (as R4) |
| `plan_item_id` | `uuid` null | Tied planned payment (R8-04); composite FK to `plan_items`; must fit the template |
| `sort_key` | `text` not null | R2 order key |
| `hidden` | `boolean` not null default false | Off the quick-add list, kept in Manage templates |
| `state` | `record_state` | `active` / `deleted` (soft delete) |
| `deleted_at`, `field_versions`, `server_seq`, `created_at`, `updated_at` | | R2 conventions |

Indexes: `(user_id, server_seq)`, unique `lower(name)` per user where not deleted. Composite FKs
`(x_id, user_id)` to accounts, payees, categories and plan items.

Field versions: one per field except `amountMinor` + `lines` (one version, `amountMinor`), and `state`.

## Derived (core)

| Value | Definition |
|-------|-----------|
| Recording | `recordFromTemplate`: the template's fields + amount from the box + today (+ plan link) |
| Tied month | `tiedPlanMonth`: oldest carried row of the item with something left, else this month's row with something left, else none |
| Problems | `templateProblems`: references archived or deleted since |
| Visible list | live, not hidden, ordered by `sort_key`, then name |

## State transitions

`active (visible) ⇄ active (hidden)`; `active → deleted` (soft). Recordings are untouched by all of them.

## FR traceability

| FR | Where |
|----|-------|
| FR-001, FR-002 | table checks; `_apply_template`; core `TemplateCreateFields` |
| FR-003 | core `templateFromTransaction` |
| FR-004 | `sort_key` (R8-02) |
| FR-005 | sync entity `template`; `LIMIT_REACHED` |
| FR-006 | recordings keep no template id |
| FR-007 – FR-011 | core `recordFromTemplate`, `templateProblems`; client Undo / repeat check |
| FR-012 | `plan_item_id`; core `tiedPlanMonth`, `templateFitsPlan` |
| FR-013 | quick-add list on Transactions, Dashboard strip, form |
| FR-015 | `_repoint_*` updated |
| FR-016 | demo templates; reset, erasure |
| FR-017 | audit trigger, family `template` |
