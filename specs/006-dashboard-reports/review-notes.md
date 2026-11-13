# Review notes: Dashboard, Reports & Statements (R6)

Code the constitution requires the owner to review explicitly before merge (Development Workflow
& Quality Gates: authorization/RLS, sync, money). Links are relative to the repository root.

## 1. Two report readers (SECURITY DEFINER)

[20261103000002_rpt_readers.sql](../../supabase/migrations/20261103000002_rpt_readers.sql)

- `app.category_payee_totals(p_from, p_to)` and `app.month_totals(p_from, p_to)` read
  `private.transaction_postings`, which clients cannot read, so they are SECURITY DEFINER with
  `search_path = ''`. Each one filters on `auth.uid()` only, refuses inactive users, and checks the range
  through `app._report_range` (from ≤ to, at most 3,660 days). Execute is revoked from `public` and
  `anon` and granted to `authenticated`.
- They return totals only, never rows. The transactions behind a payee come from the R4 search, which
  is SECURITY INVOKER under row-level security.
- Tests: [rpt_readers.test.sql](../../supabase/tests/rpt_readers.test.sql) (14). They check own data
  only, the counting rules, refunds, Uncategorised and "no payee". There is also an integration parity
  test against core
  ([reports-parity.int.test.ts](../../apps/web/lib/reports-parity.int.test.ts)): the readers equal
  core's twins on the shared vectors, and a last-level search returns exactly the transactions behind
  the total.

## 2. `app.search_transactions` (replaced, still INVOKER)

The same migration adds two filters:
- `categoryExact`: the category itself, not its sub-categories.
- `payeeId: "none"`: transactions with no payee.

The web `FiltersSchema` accepts both (`categoryExact` only with a category, from `exact=1`).

## 3. New synced field and preference

[20261103000001_rpt_fields.sql](../../supabase/migrations/20261103000001_rpt_fields.sql)

- **`payees.statement_sign`** (enum, default `they_owe_positive`):
  - `_apply_payee` was replaced only to allow `statementSign` on create and update; same validation
    and field versions otherwise.
  - Core schemas and views, the db mapper, demo data and the **mobile row mapper** all learned the
    field in this PR (the R4 lesson).
- **`user_preferences.buffer_minor`** (bigint, `0 … 999,999,999,999`):
  - A column grant allows `update (buffer_minor)` only.
  - It goes through the R1 preferences endpoint as a decimal string.

## 4. Money code

- **Core** [reports](../../packages/core/src/reports/index.ts):
  - `categoryTree` builds the drill-down.
  - `monthlyTrend` and `safeToSpend` give the trend and safe-to-spend figure.
  - `categoryShareOf` gives a split transaction's share in one category.
  - All exact bigint paise; vectors in `test/vectors/reports.json` show that every level adds up to
    the one above.
- **Statements** [statement.ts](../../packages/core/src/statements/statement.ts):
  - Opening = opening balance plus the counted effects before the range. Rows are counted movements
    in the range, and closing is the balance at the range's end, using the same `personEffectOf` as R4.
  - The sign setting only multiplies what is displayed; the closing words always follow the real
    direction.
  - Vectors cover: before or straddling the opening date, a balance flipping sign, interest, split
    shares, an empty range, the sign setting and same-day order.
- **Safe to spend** (clarify Q1):
  - Held − card owed − this month's unconfirmed outgoings (expenses and person movements out of
    accounts counted in net worth) − buffer. It never goes below 0, and any shortfall is said in words.
  - Income and transfers are not counted.

## 5. Shared files (privacy)

[document.ts](../../packages/core/src/statements/document.ts),
[statement-canvas.ts](../../apps/web/lib/statement-canvas.ts),
[pdf.ts](../../packages/core/src/statements/pdf.ts)

- **What a file contains:** the user's display name, the person, the range, every row (date, type,
  signed amount, running balance) and the closing balance in words.
- **What it never contains:**
  - Account names: share labels say "Share of spending at Fresh Mart".
  - Another person: the business-name lookup returns "" for people.
  - Notes, unless "Include notes" was switched on for that visit; it is off by default (clarify Q2).
- **No new dependency and nothing uploaded:**
  - The page is drawn on a canvas in the browser.
  - The PDF writer embeds JPEG page images and writes no metadata (no title, author or dates).
- Files show real amounts even with hide-balances on (spec US4 5); the screen masks them.
- The file name holds the person's name and the range; characters a file name can't carry are dropped.

## Decisions and interpretations

- **Clarify Q1:** safe to spend subtracts this month's upcoming and to-confirm outgoings and a buffer;
  income is not counted.
- **Clarify Q2:** statement notes are off in files by default, with an "Include notes" switch; the
  screen always shows them.
- **Report URLs:**
  - `/reports?view=spending|income|trend&period=…&from=…&to=…&cat=…&own=1&payee=…`
  - A category with sub-categories lists them, plus "<name> itself" for spending recorded on the
    category directly (`own=1`); that entry opens its payees.
- **Payee level:** each transaction shows its share in the category, so a split lists only its lines
  there and the list adds up to the payee's total. At most 200 are listed, with a note when there
  are more.
- **Not built from research R6-07:**
  - No "Other" grouping of small slices. Bars are a ranked list in which every entry is a labelled
    link, so nothing needs hiding.
  - No pie chart.
- **Hide-balances:**
  - Also hides bar lengths, shares and the trend bars, because they reveal amounts.
  - The tables still list the entries with masked amounts.
- **Statement range:** defaults to this financial year up to today. A reversed range shows a message
  and falls back to the default.
- **PNG limits:** the PNG stacks the pages into one image. Above 30,000 px tall (about 17 pages) it
  asks for the PDF instead.

## Fixes made alongside

- The `us5-shell` test still listed the Dashboard as a placeholder; it now lists the Dashboard and
  Reports as real screens.
- The `a11y` keyboard-order test now includes Reports.
- The `/api/me` integration test now expects `bufferMinor`.
- `main` (Android PRs #24–#26) was merged into this branch; no conflicts.

## Carried to the Android phase

- T020: Dashboard, reports and statements on Android, with the share sheet. The core functions
  (`categoryTree`, `monthlyTrend`, `safeToSpend`, `personStatement`, `statementDocument`,
  `pdfFromJpegPages`) are framework-free and ready to reuse.
