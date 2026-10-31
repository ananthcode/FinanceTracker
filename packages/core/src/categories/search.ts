/** Category search for pickers and the Categories screen (FR-005, FR-022). */
import { buildCategoryTree, compareNames, flattenTree, type CategoryNode } from "./tree";
import type { CategoryKind, CategoryView } from "./types";

export interface CategoryMatch {
  category: CategoryNode;
  path: string;
}

export interface SearchOptions {
  kind?: CategoryKind;
  /** Include hidden categories (and those below hidden ones). */
  includeHidden?: boolean;
  /** Always include this category, even when hidden — it is already chosen on the record. */
  selectedId?: string | null;
}

/**
 * Categories whose name contains the query (ignoring case), at any depth, with their full paths,
 * sorted by path. An empty query lists every category.
 */
export function searchCategories(query: string, categories: readonly CategoryView[], opts: SearchOptions = {}): CategoryMatch[] {
  const q = query.trim().toLocaleLowerCase("en");
  const tree = buildCategoryTree(categories);
  const nodes = opts.kind ? flattenTree(tree[opts.kind]) : [...flattenTree(tree.expense), ...flattenTree(tree.income)];
  return nodes
    .filter((n) => opts.includeHidden || !n.effectiveHidden || n.id === opts.selectedId)
    .filter((n) => q === "" || n.name.toLocaleLowerCase("en").includes(q))
    .map((n) => ({ category: n, path: n.path }))
    .sort((a, b) => (a.category.kind === b.category.kind ? compareNames(a.path, b.path) : a.category.kind === "expense" ? -1 : 1));
}
