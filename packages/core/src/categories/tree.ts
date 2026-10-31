/**
 * Category tree helpers (FR-002, FR-004 – FR-006, FR-022; research R3-02). The whole list is small
 * (≤ 500), so trees, paths and searches are built in memory from it.
 */
import type { CategoryKind, CategoryView } from "./types";

export interface CategoryNode extends CategoryView {
  children: CategoryNode[];
  depth: number;
  /** "Education › Kids › Swimming classes" */
  path: string;
  /** Hidden itself or below a hidden category: left out of pickers (FR-022). */
  effectiveHidden: boolean;
}

export const PATH_SEPARATOR = " › ";

/** Alphabetical, ignoring case (FR-004). */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" }) || a.localeCompare(b, "en");
}

export function indexCategories(categories: readonly CategoryView[]): Map<string, CategoryView> {
  return new Map(categories.map((c) => [c.id, c]));
}

/** The names from the top category down to this one; empty when the id is unknown. */
export function categoryPath(id: string, index: ReadonlyMap<string, CategoryView>): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (let c = index.get(id); c && !seen.has(c.id); c = c.parentId ? index.get(c.parentId) : undefined) {
    seen.add(c.id);
    names.unshift(c.name);
  }
  return names.join(PATH_SEPARATOR);
}

export function buildCategoryTree(categories: readonly CategoryView[]): Record<CategoryKind, CategoryNode[]> {
  const byParent = new Map<string | null, CategoryView[]>();
  const index = indexCategories(categories);
  for (const c of categories) {
    // A parent that is not in the list (deleted) puts the category at the top level.
    const parent = c.parentId && index.has(c.parentId) ? c.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), c]);
  }
  const build = (parentId: string | null, depth: number, parentPath: string, parentHidden: boolean): CategoryNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => compareNames(a.name, b.name))
      .map((c) => {
        const path = parentPath ? parentPath + PATH_SEPARATOR + c.name : c.name;
        const effectiveHidden = parentHidden || c.hidden;
        return { ...c, depth, path, effectiveHidden, children: build(c.id, depth + 1, path, effectiveHidden) };
      });
  const roots = build(null, 0, "", false);
  return { expense: roots.filter((n) => n.kind === "expense"), income: roots.filter((n) => n.kind === "income") };
}

/** Every node of a tree, depth first, in display order. */
export function flattenTree(nodes: readonly CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

/** The ids of a category and everything below it. */
export function subtreeIds(categories: readonly CategoryView[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return ids;
}
