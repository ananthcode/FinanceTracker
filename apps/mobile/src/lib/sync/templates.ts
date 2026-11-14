import { flowOf, type TemplateView, type TransactionLine } from "@ft/core";
import type { SyncRow } from "./types";

/**
 * Synced template rows (R8, wire shape) → the shared TemplateView, so the phone will reuse
 * packages/core/src/templates when its quick-add screen arrives in the Android phase.
 */
export function templateFromRow(row: SyncRow): TemplateView {
  const kind = (row.kind as TemplateView["kind"]) ?? "expense";
  const personAction = (row.personAction as TemplateView["personAction"]) ?? null;
  const lines = Array.isArray(row.lines) ? (row.lines as Record<string, unknown>[]) : [];
  return {
    id: row.id,
    name: String(row.name ?? ""),
    kind,
    flow: (row.flow as TemplateView["flow"]) ?? flowOf(kind, personAction) ?? "out",
    accountId: String(row.accountId ?? ""),
    toAccountId: (row.toAccountId as string | null | undefined) ?? null,
    amountMinor: row.amountMinor === null || row.amountMinor === undefined ? null : BigInt(String(row.amountMinor)),
    payeeId: (row.payeeId as string | null | undefined) ?? null,
    personAction,
    categoryId: (row.categoryId as string | null | undefined) ?? null,
    lines: lines.map(
      (l): TransactionLine => ({
        id: String(l.id),
        amountMinor: BigInt(String(l.amountMinor ?? "0")),
        categoryId: (l.categoryId as string | null) ?? null,
        personId: (l.personId as string | null) ?? null,
        personAction: (l.personAction as TransactionLine["personAction"]) ?? null,
        notes: (l.notes as string | null) ?? null,
        tagIds: Array.isArray(l.tagIds) ? (l.tagIds as string[]) : [],
      }),
    ),
    tagIds: Array.isArray(row.tagIds) ? (row.tagIds as string[]) : [],
    notes: (row.notes as string | null | undefined) ?? null,
    planItemId: (row.planItemId as string | null | undefined) ?? null,
    sortKey: String(row.sortKey ?? "a0"),
    hidden: row.hidden === true,
    state: row.state === "deleted" ? "deleted" : "active",
  };
}
