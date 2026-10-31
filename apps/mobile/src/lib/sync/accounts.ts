import type { AccountView, GroupView } from "@ft/core";
import type { SyncRow } from "./types";

/**
 * Synced rows (wire shape: camelCase, money as decimal strings) → the shared read models, so the
 * phone computes balances and totals with the same packages/core functions as the web (FR-019).
 * A row created on this phone and not yet synced has no currency: it takes the base currency.
 */
export function accountFromRow(row: SyncRow, baseCurrency: string): AccountView {
  const credit = row.creditLimitMinor;
  return {
    id: row.id,
    name: String(row.name ?? ""),
    type: row.type as AccountView["type"],
    openingBalanceMinor: BigInt(String(row.openingBalanceMinor ?? "0")),
    openingBalanceDate: String(row.openingBalanceDate ?? ""),
    currency: String(row.currency ?? baseCurrency).trim(),
    colour: String(row.colour ?? "slate"),
    icon: String(row.icon ?? "bank"),
    sortKey: String(row.sortKey ?? "a0"),
    groupId: (row.groupId as string | null | undefined) ?? null,
    includeInNetWorth: row.includeInNetWorth !== false,
    notes: (row.notes as string | null | undefined) ?? null,
    creditLimitMinor: credit === null || credit === undefined ? null : BigInt(String(credit)),
    state: (row.state as AccountView["state"]) ?? "active",
  };
}

export function groupFromRow(row: SyncRow): GroupView {
  return {
    id: row.id,
    name: String(row.name ?? ""),
    sortKey: String(row.sortKey ?? "a0"),
    state: (row.state as GroupView["state"]) ?? "active",
  };
}
