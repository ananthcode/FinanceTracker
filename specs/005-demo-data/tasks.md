---

description: "Task list for R5 — Demo data"
---

# Tasks: Demo Data

**Input**: Design documents from `/specs/005-demo-data/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (database.md,
http-api.md, client-settings.md), quickstart.md

**Tests**: Included (constitution IX; SC-002, SC-003, SC-005). Write each phase's tests first.

**Organization**: by user story. Stories 1–3 on the web now; Story 4 (Android) is deferred, its
server side (reset point) built and tested now.

## Format: `[ID] [P?] [Story] Description`

Migration names `YYYYMMDDHHMMSS_*` (`<ts>`), in the listed order.

---

## Phase 1: Setup

- [X] T001 [P] Add `NOT_EMPTY`, `NOT_AVAILABLE`, `DEMO_REJECTED`, `DATA_RESET` to `ERROR_CODES` (`packages/core/src/schemas/common.ts`) and `DATA_RESET` to the push result codes (`packages/core/src/sync/schemas.ts`); `PullResponse` gains optional `reset: boolean`
- [X] T002 [P] Migration `<ts>_data_enums.sql`: audit actions `demo_data_loaded`, `data_reset`

## Phase 2: Foundational

- [X] T003 [P] Unit `packages/core/test/demo-changes.test.ts`: `demoChanges(today, hlc)` — every change valid against the sync schemas, ids fresh and unique, every reference (group, parent, default category, account, payee, person, tag, rate payee) remapped to an id created earlier in the list, archived account archived after it is created, counts equal the generators', two calls give equal amounts/dates but different ids
- [X] T004 `packages/core/src/demo/changes.ts` (`demoChanges`, `DEMO_HLC_DEVICE`) — passes T003
- [X] T005 Migration `<ts>_data_resets.sql`: `private.data_resets` (data-model.md), no grants; `app.apply_changes` refuses changes older than `reset_at` (`DATA_RESET`); `app.pull_changes` answers `reset: true` for `0 < cursor < reset_seq`
- [X] T006 `pnpm db:types`

## Phase 3: User Story 1 — Load the demo household (P1) 🎯 MVP

- [X] T007 [P] [US1] pgTAP `data_load.test.sql`: loads into empty data; `NOT_EMPTY` otherwise (also with only deleted rows); a refused change keeps nothing (`DEMO_REJECTED`); second call refused; start choice set; one `demo_data_loaded` entry; other user untouched; inactive user refused
- [X] T008 [P] [US1] Integration `apps/web/app/api/me/data/route.int.test.ts` (load part): `GET` reports empty/available; `POST load` adds the household and returns counts; same-day balances equal for two users (SC-002); `NOT_AVAILABLE` outside demo; `NOT_EMPTY`; two concurrent loads → one household
- [X] T009 [P] [US1] Playwright `apps/web/e2e/r5-us1-load.spec.ts`: spec US1 1–4, S1-a, SC-001 (< 10 s), SC-004 (every screen has content)
- [X] T010 [US1] Migration `<ts>_data_load.sql`: `app.load_demo_data(p_changes, p_device)` per contracts/database.md — passes T007
- [X] T011 [US1] `packages/db/src/repositories/data.ts` (`dataStatus`, `loadDemoData`) and `apps/web/app/api/me/data/route.ts` (`GET`, `POST load`; strict body; rate limit 10/min; demo-environment check) — passes T008
- [X] T012 [US1] `apps/web/components/settings/YourData.tsx` in `/settings`: "Load demo data" with a confirm dialog and the outcome in words — passes T009

## Phase 4: User Story 2 — Reset / clear my data (P1)

- [X] T013 [P] [US2] pgTAP `data_reset.test.sql`: removes every financial row and its history for the caller only; postings gone; profile, preferences and sign-in history kept; `categories_start` cleared; one `data_reset` entry without record details; reset point recorded; pull from an old cursor says `reset`; push of an older change refused `DATA_RESET`, a newer one applied; 20,000 transactions reset (timed)
- [X] T014 [P] [US2] Integration (reset part): `POST reset` requires `confirm: "RESET"`; works outside demo; pull/push reset point through the sync routes (US2 5)
- [X] T015 [P] [US2] Playwright `apps/web/e2e/r5-us2-reset.spec.ts`: spec US2 1–5, S2-a, S2-b
- [X] T016 [US2] Migration `<ts>_data_reset.sql`: `app.reset_my_data(p_device)` — passes T013
- [X] T017 [US2] `resetMyData` repository, `POST reset` in the route — passes T014
- [X] T018 [US2] "Reset my data" in `YourData.tsx` with the typed-word dialog — passes T015

## Phase 5: User Story 3 — Reset and load (P2)

- [X] T019 [P] [US3] pgTAP (in `data_load.test.sql`): reset-and-load is one transaction (a refused load keeps the old data)
- [X] T020 [P] [US3] Playwright `apps/web/e2e/r5-us3-reload.spec.ts`: spec US3 1, S3-a, SC-006 (< 1 min)
- [X] T021 [US3] `app.reset_and_load_demo` (in the load migration), repository, `POST reset_and_load`, button — passes T019, T020

## Phase 6: User Story 4 — Android (P3)

- [ ] T022 [US4] *Deferred* Android: Settings actions; wipe the local store on `reset: true`; drop `DATA_RESET` results

## Phase 7: Polish

- [X] T023 [P] Accessibility: `a11y.spec.ts` covers Settings › Your data and its dialogs (axe 1280/390 px, keyboard)
- [ ] T024 [P] Replace e2e seeding where a test only needs the demo household with the load (no change to tests that seed directly)
- [X] T025 Write `specs/005-demo-data/review-notes.md`
- [ ] T026 Run every suite; write `specs/005-demo-data/validation.md`
- [ ] T027 Converge: contracts as built, ROADMAP status, Android task carried to the Android phase

## Dependencies

Setup → Foundational → US1 (MVP) → US2 → US3 → Polish. US3 needs US1 and US2.

## Notes

- The demo household itself is not new: R2–R4 generators; later modules extend them (constitution X).
- Reset is irreversible: tests must never point at a non-local database (helpers assert local).
