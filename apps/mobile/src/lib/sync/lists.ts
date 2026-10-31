import type { CategoryView, PayeeView, TagView } from "@ft/core";
import type { SyncRow } from "./types";

/** Synced rows → the shared R3 read models (R3 T071), so the phone reuses packages/core rules. */
export function categoryFromRow(row: SyncRow): CategoryView {
  return {
    id: row.id,
    name: String(row.name ?? ""),
    kind: (row.kind as CategoryView["kind"]) ?? "expense",
    parentId: (row.parentId as string | null | undefined) ?? null,
    colour: String(row.colour ?? "slate"),
    icon: String(row.icon ?? "package"),
    hidden: row.hidden === true,
  };
}

export function tagFromRow(row: SyncRow): TagView {
  return { id: row.id, name: String(row.name ?? "") };
}

export function payeeFromRow(row: SyncRow): PayeeView {
  return {
    id: row.id,
    name: String(row.name ?? ""),
    kind: (row.kind as PayeeView["kind"]) ?? "business",
    defaultCategoryId: (row.defaultCategoryId as string | null | undefined) ?? null,
    notes: (row.notes as string | null | undefined) ?? null,
    hidden: row.hidden === true,
    openingBalanceMinor: BigInt(String(row.openingBalanceMinor ?? "0")),
    openingBalanceDate: (row.openingBalanceDate as string | null | undefined) ?? null,
    includeInNetWorth: row.includeInNetWorth === true,
    // R4: the person's interest setting (none until the server says otherwise).
    interestMode: (row.interestMode as PayeeView["interestMode"] | undefined) ?? "none",
    // R6: which way their statement is signed (the default until the server says otherwise).
    statementSign: (row.statementSign as PayeeView["statementSign"] | undefined) ?? "they_owe_positive",
  };
}
