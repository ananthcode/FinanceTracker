/** Category vocabulary (R3 data-model.md). */

export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/** A category as the screens read it (packages/db listCategories; deleted rows excluded). */
export interface CategoryView {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  colour: string;
  icon: string;
  hidden: boolean;
}

/** The user's one-time choice for the default categories (FR-007). */
export type CategoriesStart = "suggested" | "empty";
