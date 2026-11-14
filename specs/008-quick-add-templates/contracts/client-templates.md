# Contract: Template screens and core functions (R8)

## Screens

| Place | Shows |
|-------|-------|
| `/transactions` (R4, extended) | "Quick add" list `#quick-add`: visible templates in order, each `[data-template]` with name, amount box (usual amount selected, or empty "Enter amount"), Record, Edit first. Empty state with "Make a template". "Manage templates" link |
| `/` Dashboard (R6, extended) | `#quick-add-strip`: first 6 visible templates, Record, and "More" to `/transactions#quick-add`; absent with none |
| `/transactions/new` (R4, extended) | "Start from a template" choice (fills the form); `?template=<id>` opens it filled in (Edit first); a tied template shows "Pays: <item> (<month>)" ticked |
| `/transactions/[id]` (R4, extended) | "Save as template" → `/templates/new?from=<transaction id>` |
| `/templates` | Manage templates: all live templates in order with Move up / Move down / Move to top, Hide / Show, Edit, Delete |
| `/templates/new`, `/templates/[id]` | Template form: name, type, account(s), usual amount (optional), payee or person and action, category or split, tags, notes, "Pays a planned payment" (optional; fitting items only) |

After Record: a `role="status"` message "Recorded <name>, <amount>, today" (+ " · pays <item> (<month>)",
or why not linked) with Undo for 10 seconds; a second Record of the same template in that time asks
"Record it again?". Every amount goes through `<Money>`.

## Core (`packages/core/src/templates/`)

```ts
TemplateCreateFields, TemplateUpdateFields            // Zod (wire)
interface TemplateView { id; name; kind; flow; accountId; toAccountId; amountMinor: bigint | null; payeeId;
  personAction; categoryId; lines; tagIds; notes; planItemId; sortKey; hidden; state }
visibleTemplates(list): TemplateView[]                   // live, not hidden, by sortKey then name
templateFromTransaction(tx, existingNames): TemplateCreateFields-like draft   // FR-003
templateProblems(t, live: { accounts; payees; categories; tags }): TemplateProblem[]   // FR-011
templateFitsPlan(t, item: PlanItem): boolean             // R8-04
tiedPlanMonth(itemId, view: PlanMonthView): PlanRow | null                     // R8-04
recordFromTemplate(t, { amountMinor, today, pays: { itemId; month } | null }): TransactionCreateFields   // R8-03
amountBoxProblem(t, text, currency): string | null       // empty / invalid / split amount changed
```
