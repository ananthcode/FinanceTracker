/**
 * Client-side checks that mirror the server's category rules (FR-006, FR-023). They shape the UI —
 * which targets are offered — but the server decides (contracts/database.md).
 */
import { subtreeIds } from "./tree";
import type { CategoryView } from "./types";

export type RuleResult = { ok: true } | { ok: false; reason: "INVALID_MOVE" | "NAME_TAKEN" | "INVALID_MERGE" };

const sameName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" }) === 0;

/** Whether a category may move under `newParentId` (null = the top level of its kind). */
export function canMoveCategory(categories: readonly CategoryView[], id: string, newParentId: string | null): RuleResult {
  const self = categories.find((c) => c.id === id);
  if (!self) return { ok: false, reason: "INVALID_MOVE" };
  if (newParentId !== null) {
    const parent = categories.find((c) => c.id === newParentId);
    if (!parent || parent.kind !== self.kind || subtreeIds(categories, id).has(newParentId)) {
      return { ok: false, reason: "INVALID_MOVE" };
    }
  }
  const clash = categories.some(
    (c) => c.id !== id && c.kind === self.kind && c.parentId === newParentId && sameName(c.name, self.name),
  );
  return clash ? { ok: false, reason: "NAME_TAKEN" } : { ok: true };
}
