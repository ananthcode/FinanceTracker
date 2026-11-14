---

description: "Task list for R8 — Quick-add templates"
---

# Tasks: Quick-add Templates

**Input**: Design documents from `/specs/008-quick-add-templates/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (sync-protocol.md,
client-templates.md), quickstart.md

**Tests**: Included (constitution IX; SC-001, SC-002, SC-004, SC-005, SC-006). Tests come first.

**Organization**: by user story. Stories 1–3 are on the web now; Story 4 (Android) is deferred, except
that the mobile row mapper learns the new entity (T005).

Migration names are `20261114000NNN_*` (`<ts>`), in the listed order.

---

## Phase 1: Setup (schema and shapes)

- [X] T001 Migration `<ts>_tpl_enums.sql`: audit actions `template_created`, `template_edited`, `template_deleted`, `template_hidden`, `template_unhidden`, `template_reordered`; target type `template`; the audit action derivation learns `hidden` and `sort_key` changes for the `template` family
- [X] T002 Migration `<ts>_tpl_tables.sql`: `public.transaction_templates` per data-model.md (name 1–40 trimmed; kind not interest; `person_action` not adjustment; amount 1…999999999999 or null; lines array; notes ≤ 1000; shape per kind check; composite FKs to accounts, payees, categories, plan items); unique `lower(name)` where not deleted; sync index; RLS select-own, SELECT-only grants; stamp and audit triggers
- [X] T003 [P] Core `packages/core/src/templates/schemas.ts`: `TemplateCreateFields` / `TemplateUpdateFields` (reusing R4 field shapes and `kindProblem`; amount and lines together on update; split needs an amount), `TemplateView`; sync entity `template` and code `INVALID_TEMPLATE` in `packages/core/src/sync/schemas.ts`; export from `packages/core/src/index.ts`
- [X] T004 [P] `packages/db/src/repositories/templates.ts` (`listTemplates`, `getTemplate`, `templateFromRow`), data-status table list, sync pull rows; `pnpm db:types`
- [X] T005 [P] Mobile `apps/mobile/src/lib/sync/templates.ts` row mapper (no screens)

## Phase 2: Foundational (core rules, applier, sync)

- [X] T006 [P] Core vectors `packages/core/test/templates.test.ts`: schemas per kind (transfer two accounts, person needs a person, no adjustment or interest, split amount rule), `recordFromTemplate` (today, box amount, link fields), `amountBoxProblem` (empty, invalid, split changed), `templateProblems` (archived account, deleted payee/category/tag; hidden payee fine), `templateFitsPlan` (payee, card, person items), `tiedPlanMonth` (carried first, this month, none), `templateFromTransaction` (no date/status/reference/link; free name), `visibleTemplates` order
- [X] T007 Core `packages/core/src/templates/rules.ts` — passes T006
- [X] T008 [P] pgTAP `supabase/tests/tpl_apply.test.sql` and `tpl_rls.test.sql`: own data only; another user's account/payee/category/tag/plan item refused (`INVALID_TEMPLATE`); shape per kind; split lines add up; `NAME_TAKEN`; `LIMIT_REACHED` at 100; tie fit; per-field merge (amount + lines together); hide, reorder, delete; audit actions
- [X] T009 Migration `<ts>_tpl_apply.sql`: `app._apply_template` and `_apply_one` dispatch — passes T008
- [X] T010 [P] pgTAP `supabase/tests/tpl_data.test.sql`: payee, category and tag merges / relocate / tag delete reach templates (versions bumped); pull returns templates; reset and erasure remove them; demo-load emptiness counts them
- [X] T011 Migration `<ts>_tpl_repoint_pull_reset.sql`: `_repoint_payee`, `_repoint_category`, `_repoint_tag` also update templates; `pull_changes`, `_reset_user_data`, `_load_demo`, `scrub_user_from_audit` include them — passes T010
- [X] T012 [P] Integration `apps/web/lib/templates-sync.int.test.ts`: push/pull round trip; a recording from a tied template (R4 create with R7 link fields) links; demo load counts templates
- [X] T013 Change builders in `apps/web/lib/sync-client.ts` (`createTemplate`, `updateTemplate`, `deleteTemplate`) — passes T012

## Phase 3: User Story 1 — Record in one tap (P1) 🎯 MVP

- [X] T014 [P] [US1] Demo templates `packages/core/src/demo/templates.ts` + `demo/changes.ts` (Milk ₹60.00 cash, Groceries amount each time, Fuel ₹2,500.00 on the card, Wallet top-up transfer ₹500.00, Repay Meera ₹5,000.00 tied to the plan's "Repay Meera"); demo tests updated
- [X] T015 [P] [US1] Playwright `apps/web/e2e/r8-us1-record.spec.ts`: US1 1–10, S1-a – S1-e, SC-001, SC-002 (one transaction, balance once, Undo exact, repeat asks, tied links, empty amount refused, split amount opens the form, missing reference opens the form)
- [X] T016 [US1] `apps/web/components/templates/QuickAdd.tsx` (list with amount box, Record, Edit first, status message with Undo, repeat check) on `/transactions`; `/transactions/new?template=<id>` fills the form (tied: "Pays:" ticked) — passes T015

## Phase 4: User Story 2 — Make and manage templates (P1)

- [X] T017 [P] [US2] Playwright `apps/web/e2e/r8-us2-manage.spec.ts`: US2 1–6, S2-a, S2-b, SC-003, SC-005 (form per kind, Save as template, move up/down/top, hide/show, delete, edit leaves recordings unchanged, name taken, tie offers fitting items only)
- [X] T018 [US2] `/templates`, `/templates/new`, `/templates/[id]`, `components/templates/TemplateForm.tsx`, `ManageTemplates.tsx`; "Save as template" on the transaction screen — passes T017

## Phase 5: User Story 3 — Quick add where it is needed (P2)

- [X] T019 [P] [US3] Playwright `apps/web/e2e/r8-us3-where.spec.ts`: US3 1–4, S3-a, S3-b (Dashboard strip first 6 and More; absent with none; "Start from a template" fills the form; empty state)
- [X] T020 [US3] Dashboard strip and "Start from a template" in the add form — passes T019

## Phase 6: User Story 4 — Android (P3)

- [ ] T021 [US4] *Deferred* to the Android phase: quick add on the home screen, offline recording, manage templates, reusing core `templates/*`

## Phase 7: Polish

- [X] T022 [P] Accessibility in `apps/web/e2e/a11y.spec.ts` (quick add, Dashboard strip, manage, form at 1280 and 390 px; Record and reorder by keyboard) and `us7-hide-balances` (template amounts masked) (SC-006, FR-014)
- [X] T023 Write `specs/008-quick-add-templates/review-notes.md` (explicit-review items from the plan)
- [X] T024 Run every suite; write `specs/008-quick-add-templates/validation.md`, including SC-004 (quick add with 100 seeded templates timed in the e2e run)
- [X] T025 Converge: contracts as built, `ROADMAP.md` R8 status, Android task carried to the Android phase

## Dependencies

- Setup (T001–T005) → Foundational (T006–T013) → US1 (MVP) → US2 → US3 → Polish.
- T007 needs T006; T009 needs T008 and T002; T011 needs T009; T013 needs T011 and T007.
- US1 needs T007 and T013; US2's form reuses the R4 form parts; US3 reuses US1's QuickAdd.

## Implementation Strategy

1. MVP = Setup + Foundational + US1: demo templates recorded in one tap with Undo.
2. US2 (make, Save as template, order, hide, delete), then US3 (Dashboard, form).
3. Polish, review notes, validation, converge, then the PR. Android follows in the Android phase.
