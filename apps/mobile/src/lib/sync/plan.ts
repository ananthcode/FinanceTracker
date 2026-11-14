import type { PlanItem, PlanOccurrence, PlanTerm } from "@ft/core";
import type { SyncRow } from "./types";

/**
 * Synced plan rows (R7, wire shape) → the shared plan read models, so the phone will reuse
 * packages/core/src/plan when its screens arrive in the Android phase. The device store keeps every
 * entity in one table, so no device migration is needed.
 */
export function planItemFromRow(row: SyncRow): PlanItem {
  const terms = Array.isArray(row.terms) ? (row.terms as Record<string, unknown>[]) : [];
  return {
    id: row.id,
    name: String(row.name ?? ""),
    target: (row.target as PlanItem["target"]) ?? "payee",
    payeeId: (row.payeeId as string | null | undefined) ?? null,
    categoryId: (row.categoryId as string | null | undefined) ?? null,
    cardAccountId: (row.cardAccountId as string | null | undefined) ?? null,
    personAction: (row.personAction as PlanItem["personAction"] | undefined) ?? null,
    frequency: (row.frequency as PlanItem["frequency"]) ?? "monthly",
    intervalMonths: Number(row.intervalMonths ?? 1),
    startMonth: String(row.startMonth ?? ""),
    endMonth: (row.endMonth as string | null | undefined) ?? null,
    amountVaries: row.amountVaries === true,
    terms: terms.map(
      (t): PlanTerm => ({
        fromMonth: String(t.fromMonth ?? ""),
        amountMinor: t.amountMinor === null || t.amountMinor === undefined ? null : BigInt(String(t.amountMinor)),
        dueDay: Number(t.dueDay ?? 1),
        accountId: String(t.accountId ?? ""),
      }),
    ),
    notes: (row.notes as string | null | undefined) ?? null,
    state: row.state === "deleted" ? "deleted" : "active",
  };
}

export function planOccurrenceFromRow(row: SyncRow): PlanOccurrence {
  return {
    id: row.id,
    itemId: String(row.itemId ?? ""),
    month: String(row.month ?? ""),
    amountMinor: row.amountMinor === null || row.amountMinor === undefined ? null : BigInt(String(row.amountMinor)),
    skipped: row.skipped === true,
  };
}
