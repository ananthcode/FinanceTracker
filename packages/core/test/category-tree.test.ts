import { describe, expect, it } from "vitest";
import {
  buildCategoryTree,
  canMoveCategory,
  categoryPath,
  indexCategories,
  searchCategories,
  type CategoryView,
} from "../src/categories";

/** T020 — tree, paths, search and move rules (FR-002, FR-004 – FR-006, FR-022). */
const cat = (id: string, name: string, parentId: string | null = null, extra: Partial<CategoryView> = {}): CategoryView => ({
  id,
  name,
  kind: "expense",
  parentId,
  colour: "green",
  icon: "shopping-cart",
  hidden: false,
  ...extra,
});

const list: CategoryView[] = [
  cat("edu", "Education"),
  cat("kids", "Kids", "edu"),
  cat("swim", "Swimming classes", "kids"),
  cat("tuition", "tuition & classes", "edu", { hidden: true }),
  cat("maths", "Maths", "tuition"),
  cat("food", "Food & groceries"),
  cat("eat", "Eating out", "food"),
  cat("apple", "apples", "food"),
  cat("salary", "Salary", null, { kind: "income" }),
  cat("bonus", "Bonus", "salary", { kind: "income" }),
];

describe("buildCategoryTree", () => {
  it("splits Expense and Income and sorts alphabetically ignoring case at every level", () => {
    const tree = buildCategoryTree(list);
    expect(tree.expense.map((n) => n.name)).toEqual(["Education", "Food & groceries"]);
    expect(tree.expense[1]!.children.map((n) => n.name)).toEqual(["apples", "Eating out"]);
    expect(tree.expense[0]!.children.map((n) => n.name)).toEqual(["Kids", "tuition & classes"]);
    expect(tree.income.map((n) => n.name)).toEqual(["Salary"]);
  });

  it("gives each node its depth, path and effective hidden state", () => {
    const tree = buildCategoryTree(list);
    const swim = tree.expense[0]!.children[0]!.children[0]!;
    expect(swim).toMatchObject({ depth: 2, path: "Education › Kids › Swimming classes", effectiveHidden: false });
    const maths = tree.expense[0]!.children[1]!.children[0]!;
    expect(maths).toMatchObject({ hidden: false, effectiveHidden: true });
  });
});

describe("categoryPath", () => {
  it("joins names from the top with ›", () => {
    const index = indexCategories(list);
    expect(categoryPath("swim", index)).toBe("Education › Kids › Swimming classes");
    expect(categoryPath("salary", index)).toBe("Salary");
    expect(categoryPath("missing", index)).toBe("");
  });
});

describe("searchCategories", () => {
  it("matches any part of a name, case-insensitively, at any depth, with paths", () => {
    expect(searchCategories("CLASS", list).map((r) => r.path)).toEqual(["Education › Kids › Swimming classes"]);
    expect(searchCategories("a", list, { includeHidden: true }).map((r) => r.category.id)).toContain("maths");
  });

  it("leaves out hidden categories and their descendants unless asked or already selected", () => {
    expect(searchCategories("math", list)).toEqual([]);
    expect(searchCategories("math", list, { selectedId: "maths" }).map((r) => r.category.id)).toEqual(["maths"]);
  });

  it("filters by kind and lists everything for an empty query, sorted by path", () => {
    expect(searchCategories("", list, { kind: "income" }).map((r) => r.path)).toEqual(["Salary", "Salary › Bonus"]);
  });
});

describe("canMoveCategory", () => {
  it("allows a move under another category of the same kind or to the top level", () => {
    expect(canMoveCategory(list, "swim", "food")).toEqual({ ok: true });
    expect(canMoveCategory(list, "kids", null)).toEqual({ ok: true });
  });

  it("refuses self, descendants, the other kind and a same-named sibling", () => {
    expect(canMoveCategory(list, "edu", "edu")).toEqual({ ok: false, reason: "INVALID_MOVE" });
    expect(canMoveCategory(list, "edu", "swim")).toEqual({ ok: false, reason: "INVALID_MOVE" });
    expect(canMoveCategory(list, "eat", "salary")).toEqual({ ok: false, reason: "INVALID_MOVE" });
    expect(canMoveCategory([...list, cat("kids2", "KIDS", "food")], "kids2", "edu")).toEqual({ ok: false, reason: "NAME_TAKEN" });
  });
});
