# Finance Tracker Constitution

Finance Tracker is a personal-finance application (web + Android) for a very small group of
users — one owner-admin, household members and a few invited testers — focused on India.
Manual transaction entry is primary; bank and credit-card statements are used to reconcile.
Product scope: `docs/SCOPE.md`. Module roadmap: `ROADMAP.md`. The repository is **public**.

## Core Principles

### I. Per-User Data Isolation (NON-NEGOTIABLE)

- Every user's financial data MUST be private to that user.
- Isolation MUST be enforced at the database layer: row-level security enabled on every
  user-owned table, with default-deny policies. Application-code checks alone are never
  sufficient.
- The only elevated role is a single owner-admin who manages invites. The admin MUST NOT be
  able to read or modify other users' financial data through the application, except to
  permanently erase another user under Principle III; erasure MUST NOT reveal any of that
  user's data to the owner-admin at any step.

Rationale: users trust the app with private money data; a single missed `WHERE` clause in
application code must not be able to leak it.

### II. Money Correctness (NON-NEGOTIABLE)

- Monetary amounts MUST be stored, transmitted and computed as exact integers in the
  smallest currency unit (paise for INR), always paired with an explicit currency code.
- Floating-point types MUST NOT be used for money anywhere — storage, APIs, sync payloads or
  computation (binary floating point cannot represent most decimal fractions exactly, e.g.
  `0.1 + 0.2 ≠ 0.3`). Values arriving as decimals (e.g., imported files) MUST be converted to
  integer minor units at the boundary with an explicit, tested rounding rule.
- Every rounding operation (splits, interest, allocations) MUST use a documented rule and
  MUST NOT lose or create paise (remainders are allocated deterministically).
- Account balances MUST be derivable from recorded transactions. Any stored or cached
  balance MUST be reconcilable with the transaction history and recomputable on demand.

Rationale: a finance tracker that drifts by a paisa loses the user's trust; reconciliation
against bank statements is a core feature and requires exact arithmetic.

### III. Auditable Financial Records (NON-NEGOTIABLE)

- Every create, update and delete of a financial record (accounts, transactions, splits,
  categories, payees, tags, and later budgets, loans, holdings, valuations) MUST be captured
  in an append-only change history recording who, when, and the before/after state — from
  the first release.
- Records MUST be soft-deleted, never hard-deleted, except through:
  (a) a user's own explicit "erase all my data" action;
  (b) owner-admin erasure of another user (never themselves) with dual confirmation — a warning
  describing what will be erased and that it cannot be undone, then typing that user's email
  exactly;
  (c) demo-data reset in the demo environment.
- Erasure under (a) or (b) MUST also remove the user's personal identifiers from earlier audit
  events and leave only a minimal erasure record (who erased, when, and a non-identifying
  reference to the erased user).
- Reconciled records MUST be immutable unless the user explicitly un-reconciles them; the
  un-reconcile action is itself audited.

Rationale: users must be able to see what changed and recover from mistakes; later features
(undo, reconciliation history) depend on this history existing from day one.

### IV. Offline-First Mobile (NON-NEGOTIABLE)

- The Android app MUST allow creating and editing records with no connectivity and MUST sync
  automatically when connectivity returns. The web app MAY require connectivity.
- Records MUST use client-generated globally unique identifiers.
- Sync MUST be idempotent and MUST NOT silently lose or duplicate data.
- Conflicts MUST be resolved by a documented, deterministic rule, and any conflict that
  discards a user's edit MUST remain recoverable from the change history (Principle III).

Rationale: expenses are recorded at the point of spending, often without signal; losing an
entry defeats the purpose of manual tracking.

### V. No Real Personal Data in the Repository (NON-NEGOTIABLE)

- The repository is public. Specs, plans, docs, test fixtures, seed data and demo data MUST
  be synthetic — no real bank or card numbers, account names, people's names, statements or
  amounts.
- Real exports and statements MUST live only in git-ignored locations on the developer's
  machine.
- CI MUST fail if data files (`csv`, `zip`, `xls`, `xlsx`, `pdf`) are tracked outside
  `tests/fixtures/`, or if environment/secret files are tracked.

Rationale: git history is permanent and public; prevention is the only reliable control.

### VI. Secrets & Per-Environment Configuration (NON-NEGOTIABLE)

- No credentials, keys or backend URLs in source code.
- All configuration MUST be per-environment, with at least two environments: **demo**
  (synthetic data, testers) and **live** (real data, created at go-live). Values are
  supplied via environment variables or platform secrets; a `.env.example` with placeholder
  values is committed.
- Only publishable (anon) keys may reach client apps. Service-role or other privileged keys
  MUST only be used server-side.

Rationale: demo and live must never share data or credentials, and a leaked privileged key
would bypass Principle I.

### VII. Shared Core, Thin Clients

- Domain logic — money arithmetic, Indian number formatting, balance computation, category
  roll-ups, validation schemas, and import/parse/match logic — MUST live in a shared,
  framework-agnostic TypeScript package used by both web and mobile.
- Apps contain UI, navigation and platform glue only; they MUST NOT re-implement domain rules.
- The codebase is a single monorepo.

Rationale: web and Android must compute identical balances and reports; duplicated logic
drifts.

### VIII. Validate at Every Boundary

- All external input — forms, file uploads, imported statements and backups, sync payloads,
  API requests — MUST be validated against an explicit schema before use.
- The database MUST additionally enforce types, foreign keys, not-null and check constraints
  as the last line of defence.

Rationale: imports and offline sync bring in data the UI never saw; invalid data must be
rejected, not stored.

### IX. Testing Discipline

- Shared-core domain logic MUST have unit tests covering edge cases: zero, negative and very
  large amounts; lakh/crore formatting; date and timezone boundaries; the Apr–Mar financial
  year.
- Row-level-security policies MUST have automated tests proving one user cannot read or write
  another user's data, and that the owner-admin cannot read users' financial data.
- Parsers and importers MUST be tested against synthetic fixtures.
- Sync MUST have tests for offline create/edit, retry, duplicate delivery and conflict
  scenarios.
- All tests run in CI on every push; `main` MUST stay green.

Rationale: correctness and privacy are the product; they are proven by tests, not review.

### X. Demo-First Delivery

- Phases 1–4 are built and validated in the demo environment on synthetic data.
- Every module that introduces a new kind of record MUST extend the deterministic demo
  dataset so the demo exercises that feature.
- Users MUST be able to load demo data and reset/clear their own data.
- Real data enters only the separate live environment, at go-live.

Rationale: features are evaluated by the owner and testers on realistic data before any real
financial history is migrated.

### XI. Simplicity & Free-Tier Fit

- Prefer the simplest design that satisfies the spec (YAGNI); added complexity MUST be
  justified in the plan's Complexity Tracking section.
- The system MUST run within the free tiers of the chosen platforms and respect their limits
  (database size, file storage — images compressed client-side — and inactivity pausing).
- Adding any paid dependency or service requires a constitution amendment.

Rationale: a household-scale app must stay free and maintainable by one person.

### XII. India-First Locale

- Defaults: INR; lakh/crore digit grouping (₹12,34,567.00); `dd-MMM-yyyy` dates; Apr–Mar
  financial year; `Asia/Kolkata` timezone. All are per-user preferences.
- Timestamps MUST be stored in UTC and rendered in the user's timezone. Calendar-date fields
  (e.g., a transaction's date) MUST be stored as dates, not as midnight timestamps. A
  transaction MAY carry an optional local time of day, used only for ordering within a day;
  reports, budgets and financial-year boundaries use the calendar date.

Rationale: target users are in India; formatting and fiscal-year boundaries must be right
everywhere, not patched per screen.

### XIII. Accessible, Graphical UX

- Reports are graphical-first and interactive (drill-down), and every chart's underlying
  data MUST also be available as text or a table.
- Amounts may be colour-coded but MUST NOT rely on colour alone (sign or label required).
- Hide-balances mode MUST mask amounts on every screen through one shared mechanism.

Rationale: clarity for all users, and privacy mode that cannot be forgotten on a new screen.

## Technology Constraints

Fixed at project level. Library-level choices (UI kit, charting, state management, sync
engine, test runners) are made per module in its plan and MUST satisfy the principles above.

- **Language & repo**: TypeScript in strict mode across the monorepo; pnpm workspaces +
  Turborepo. Chosen over Java (the owner's primary language) because the same domain code
  must run in the browser and on the phone offline (Principles IV, VII), React Native is
  TypeScript-native, and the free hosting tier does not run Java.
- **Web**: Next.js, deployed on Vercel.
- **Mobile**: React Native via Expo, Android target; distributed through EAS builds / APK.
- **Backend**: Supabase — Postgres, Auth (Google + email/password, invite-only sign-up),
  Storage, Row Level Security.
- **Schema changes**: only through versioned SQL migrations committed to the repo; no manual
  changes to a hosted database schema.
- **Offline sync engine**: selected in the plan of roadmap module R2 and then reused by all
  modules; replacing it later requires a constitution amendment.

## Development Workflow & Quality Gates

- **Spec-driven workflow**: every roadmap module goes specify → (clarify) → plan → tasks →
  (analyze) → implement → converge. When requirements change, the highest affected artifact
  (constitution → spec → plan) is updated first and downstream artifacts are regenerated.
- **Owner gates**: the owner answers every clarification question (asked one at a time, with a
  recommendation) and approves each module at its pull request, which summarises the decisions
  made and lists the code needing explicit review. Spec, plan, task and analysis artifacts and
  the implementation proceed without separate approval unless they raise an **escalation item**,
  which MUST be put to the owner before acting:
  - a scope or roadmap change;
  - a new paid or external service;
  - a security or privacy trade-off, or any access rule beyond "users see only their own data";
  - a destructive or shared action — hosted deploys, real data, merging into `main`;
  - a recommendation that contradicts an earlier owner choice.
- **Review of AI-generated code**: all AI-generated code MUST be reviewed by the owner and
  pass all tests before merge. Changes touching authentication, authorization/RLS
  policies, sync, or money arithmetic require explicit, called-out review, listed in the
  module's pull request.
- **Git**: short-lived feature branches; pull requests into `main`; CI green before merge;
  Conventional Commits messages.
- **Backups**: users can export all their data; the owner keeps periodic database dumps of
  the live environment.
- **Observability**: errors are logged with enough context to debug, and logs MUST NOT
  contain financial details (amounts, descriptions, account names) or personal data.

## Governance

- This constitution supersedes all other practices and guidance in the repository.
- Amendments are made through `/speckit-constitution`, with a semantic version bump and a
  dated Sync Impact note: MAJOR for removed or redefined principles, MINOR for added
  principles or materially expanded guidance, PATCH for clarifications and wording.
- Every implementation plan MUST include a Constitution Check that passes each principle or
  documents a justified exception in Complexity Tracking; unjustified violations block the
  plan gate.
- Pull-request review MUST verify compliance with the non-negotiable principles (I–VI).
- Product scope and sequencing live in `docs/SCOPE.md` and `ROADMAP.md`; where they conflict
  with this constitution, this constitution wins until amended.

**Version**: 1.2.0 | **Ratified**: 2026-10-10 | **Last Amended**: 2026-10-25
