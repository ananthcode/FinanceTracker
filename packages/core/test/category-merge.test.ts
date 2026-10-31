import { describe, expect, it } from "vitest";
import { canDeleteCategory, canMergeCategory, mergePreview, type CategoryView } from "../src/categories";

/** R3 T059 — merge and delete rules the UI shows before the server decides (FR-023, FR-025; SC-003). */
const cat = (id: string, name: string, parentId: string | null = null, kind: "expense" | "income" = "expense"): CategoryView => ({
  id,
  name,
  kind,
  parentId,
  colour: "green",
  icon: "utensils",
  hidden: false,
});

// Eating out › Weekend › Brunch ; Eating out › Office      Food delivery › WEEKEND › Dinner
const list = [
  cat("src", "Eating out"),
  cat("sw", "Weekend", "src"),
  cat("sb", "Brunch", "sw"),
  cat("so", "Office", "src"),
  cat("tgt", "Food delivery"),
  cat("tw", "WEEKEND", "tgt"),
  cat("td", "Dinner", "tw"),
  cat("salary", "Salary", null, "income"),
];
const payees = [
  { id: "p1", defaultCategoryId: "src" },
  { id: "p2", defaultCategoryId: "sw" },
  { id: "p3", defaultCategoryId: "so" },
  { id: "p4", defaultCategoryId: null },
];

describe("canMergeCategory", () => {
  it("allows a merge into another category of the same kind", () => {
    expect(canMergeCategory(list, "src", "tgt")).toEqual({ ok: true });
    expect(canMergeCategory(list, "sb", "src")).toEqual({ ok: true }); // into an ancestor is fine
  });

  it("refuses itself, its descendants and the other kind", () => {
    expect(canMergeCategory(list, "src", "src")).toEqual({ ok: false, reason: "INVALID_MERGE" });
    expect(canMergeCategory(list, "src", "sb")).toEqual({ ok: false, reason: "INVALID_MERGE" });
    expect(canMergeCategory(list, "src", "salary")).toEqual({ ok: false, reason: "INVALID_MERGE" });
  });
});

describe("mergePreview", () => {
  it("counts what moves, what merges (recursively) and which payee defaults change — like the server", () => {
    expect(mergePreview(list, payees, "src", "tgt")).toEqual({
      moved: ["Brunch", "Office"], // Brunch moves under the target's WEEKEND
      merged: [{ from: "Weekend", into: "WEEKEND" }],
      payeeDefaults: 2, // p1 (source) and p2 (Weekend, merged away); p3 keeps Office, which moves
    });
  });
});

describe("canDeleteCategory", () => {
  it("allows a leaf and counts payees that lose it as their default", () => {
    expect(canDeleteCategory(list, payees, "so")).toEqual({ ok: true, payeeDefaults: 1 });
    expect(canDeleteCategory(list, payees, "td")).toEqual({ ok: true, payeeDefaults: 0 });
  });

  it("refuses a category with sub-categories", () => {
    expect(canDeleteCategory(list, payees, "src")).toEqual({ ok: false, reason: "HAS_SUBCATEGORIES" });
  });
});
