/**
 * Client-side checks that mirror the server's category rules (FR-006, FR-023). They shape the UI —
 * which targets are offered — but the server decides (contracts/database.md).
 */
import { subtreeIds } from "./tree";
import type { CategoryView } from "./types";

export type RuleResult = { ok: true } | { ok: false; reason: "INVALID_MOVE" | "NAME_TAKEN" | "INVALID_MERGE" };

type PayeeDefault = { defaultCategoryId: string | null };

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

/** Whether `sourceId` may merge into `targetId`: same kind, not itself or one of its descendants (FR-023). */
export function canMergeCategory(categories: readonly CategoryView[], sourceId: string, targetId: string): RuleResult {
  const source = categories.find((c) => c.id === sourceId);
  const target = categories.find((c) => c.id === targetId);
  if (!source || !target || source.kind !== target.kind || subtreeIds(categories, sourceId).has(targetId)) {
    return { ok: false, reason: "INVALID_MERGE" };
  }
  return { ok: true };
}

export interface MergePreview {
  /** Sub-categories that move under the target (with everything beneath them). */
  moved: string[];
  /** Sub-categories merged into a same-named one already under the target, at any depth. */
  merged: { from: string; into: string }[];
  /** Payees whose default category changes to the target (or the matching sub-category). */
  payeeDefaults: number;
}

/** What a merge will do, computed exactly as app._merge_category does it (research R3-05). */
export function mergePreview(
  categories: readonly CategoryView[],
  payees: readonly PayeeDefault[],
  sourceId: string,
  targetId: string,
): MergePreview {
  const preview: MergePreview = { moved: [], merged: [], payeeDefaults: 0 };
  const mergedAway = new Set<string>();
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id);
  const walk = (source: string, target: string) => {
    mergedAway.add(source);
    for (const child of childrenOf(source)) {
      const same = childrenOf(target).find((t) => sameName(t.name, child.name));
      if (same) {
        preview.merged.push({ from: child.name, into: same.name });
        walk(child.id, same.id);
      } else {
        preview.moved.push(child.name);
      }
    }
  };
  walk(sourceId, targetId);
  preview.payeeDefaults = payees.filter((p) => p.defaultCategoryId !== null && mergedAway.has(p.defaultCategoryId)).length;
  return preview;
}

/** Whether a category may be deleted (FR-025; activity arrives with R4) and how many payee defaults it clears. */
export function canDeleteCategory(
  categories: readonly CategoryView[],
  payees: readonly PayeeDefault[],
  id: string,
): { ok: true; payeeDefaults: number } | { ok: false; reason: "HAS_SUBCATEGORIES" } {
  if (categories.some((c) => c.parentId === id)) return { ok: false, reason: "HAS_SUBCATEGORIES" };
  return { ok: true, payeeDefaults: payees.filter((p) => p.defaultCategoryId === id).length };
}
