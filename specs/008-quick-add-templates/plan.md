# Implementation Plan: Quick-add Templates

**Branch**: `008-quick-add-templates` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-quick-add-templates/spec.md`

## Summary

Saved templates for frequent transactions, recorded in one selection:
- **Templates**: a transaction's details without the date, an optional usual amount, an order the user
  sets, hide and delete, "Save as template" from a transaction, and an optional tie to one planned payment.
- **Recording**: an amount box beside Record (the usual amount, or empty for amounts that vary); Record
  makes an ordinary transaction dated today; Undo for 10 seconds; "Record it again?" for a repeat within
  10 seconds; a tied template links to its planned payment's oldest unpaid month.
- **Where**: Transactions screen, a Dashboard strip (first 6), and "Start from a template" in the form.
- **Elsewhere**: merges reach templates; demo household gets templates; reset and erasure remove them.

**How it is built**: one new synced table `transaction_templates` shaped like a transaction (R8-01) with
R2 order keys (R8-02); a recording is an ordinary R4 create (R8-03), with R7 link fields when tied
(R8-04). Every rule is a pure function in core (`templates/*`), reused by Android later. No new readers
or dependencies. Decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x strict on Node.js 24 LTS; SQL (PostgreSQL 15+, Supabase)

**Primary Dependencies**: As R7. **No new dependencies.**

**Storage**: new synced table `transaction_templates` ([data-model.md](data-model.md)).

**Testing**: Vitest (core vectors), pgTAP (RLS, applier, merges, reset/erasure), integration (sync round
trip, tied recording), Playwright (+ axe).

**Target Platform**: Web on Vercel Hobby; Android in the Android phase (the mobile row mapper learns the
entity now); Supabase Free.

**Project Type**: Monorepo (R1 layout).

**Performance Goals**: quick-add list within 1 s with 100 templates; a recording in balances within 1 s
(SC-004).

**Constraints**: free tiers; `bigint` paise as decimal strings; the single R2 write path; no financial
data in logs; nothing links to the plan except through a tie the user set (clarify Q1).

**Scale/Scope**: routes 3 new (`/templates`, `/templates/new`, `/templates/[id]`), 4 extended (Dashboard,
Transactions, transaction new and detail); 1 synced table; stories 4 (3 on the web now).

## Constitution Check

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Isolation | PASS | RLS select-own; composite FKs `(id, user_id)` to accounts, payees, categories, plan items; applier checks tags and lines; pgTAP proves it |
| II | Money | PASS | `bigint` paise; split lines add up exactly; a recording uses the exact amount in the box |
| III | Audit | PASS | Audit trigger, family `template`; soft delete; reset and erasure cover the table |
| IV | Offline-first | PASS (phased) | Synced entity on R2's engine; per-field merge; amount + lines one version; Android in its phase |
| V | No real data | PASS | Demo templates are synthetic |
| VI | Secrets | PASS | None |
| VII | Shared core | PASS | Recording, problems, tie fit and month, order, "Save as template" all in core |
| VIII | Validation | PASS | Zod for templates; the applier re-validates; recordings go through the R4 applier |
| IX | Testing | PASS | Vectors per kind, split and amount edges; RLS; merges; e2e incl. undo and repeat |
| X | Demo-first | PASS | Demo household gets templates, one tied to a planned payment |
| XI | Simplicity | PASS | One table; recordings are ordinary transactions; Undo and the repeat check are client-side |
| XII | India-first | PASS | Today in the user's timezone; lakh/crore amounts |
| XIII | Accessible UX | PASS | Words for every state; keyboard Record and reorder (buttons, no drag only); `<Money>` everywhere |
| Flow | Gates | PASS | Clarify answered 2026-11-14 (Q1–Q4); sync, RLS and money code listed for review |

**Post-design re-check**: PASS. Explicit review at the PR: the applier and its checks; the tie's fit and
FK; the repoint changes; reset and erasure; the recording path (amount box, R4 create with link fields).

## Project Structure

### Documentation (this feature)

```text
specs/008-quick-add-templates/   plan, research, data-model, quickstart, contracts/, checklists/, tasks
```

### Source Code (repository root)

```text
packages/core/src/templates/     schemas.ts, rules.ts (visibleTemplates, templateFromTransaction,
                                 templateProblems, templateFitsPlan, tiedPlanMonth, recordFromTemplate,
                                 amountBoxProblem)
packages/core/src/demo/templates.ts
packages/core/test/              templates vectors
packages/db/src/repositories/templates.ts
supabase/migrations/20261114000001_tpl_enums.sql … tables, rules, apply, repoint, pull/reset
supabase/tests/tpl_*.test.sql
apps/web/
├── app/(app)/templates/page.tsx, new/page.tsx, [id]/page.tsx
├── components/templates/        QuickAdd (list + strip), TemplateForm, ManageTemplates
├── app/(app)/transactions/…     Quick add on the list; "Start from a template"; "Save as template"
├── app/(app)/page.tsx           Dashboard strip
└── e2e/r8-*.spec.ts
apps/mobile/src/lib/sync/templates.ts   row mapper (no screens yet)
```

**Structure Decision**: As R1–R7.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| `plan_item_id` on templates | Clarify Q1 (B): one tap pays a planned payment | Linking by guessing breaks R7's "never silently" rule |
