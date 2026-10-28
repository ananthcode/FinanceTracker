import { describe, expect, it } from "vitest";
import { ACCOUNT_COLOUR_KEYS } from "../src/accounts";
import { APPEARANCE_ICON_KEYS } from "../src/appearance";
import { CategoryCreateFields, DEFAULT_CATEGORIES, DEFAULT_CATEGORY_COUNT } from "../src/categories";

/** T021 — the suggested defaults match the spec's tables (FR-007). */
const parents = (kind: string) => DEFAULT_CATEGORIES.filter((c) => c.kind === kind);

describe("DEFAULT_CATEGORIES", () => {
  it("has the spec's 14 expense and 8 income parents, 74 categories in all", () => {
    expect(parents("expense").map((c) => c.name)).toEqual([
      "Food & groceries", "Home", "Utilities & bills", "Transport", "Health", "Education", "Shopping",
      "Family & social", "Entertainment", "Travel", "Insurance", "Taxes & charges", "Interest paid", "Miscellaneous",
    ]);
    expect(parents("income").map((c) => c.name)).toEqual([
      "Salary", "Business & freelance", "Interest received", "Dividends", "Rent received", "Gifts received",
      "Refunds & cashback", "Other income",
    ]);
    expect(DEFAULT_CATEGORY_COUNT).toBe(74);
    expect(parents("expense").reduce((n, c) => n + 1 + c.children.length, 0)).toBe(64);
  });

  it("lists the spec's sub-categories", () => {
    const children = (name: string) => DEFAULT_CATEGORIES.find((c) => c.name === name)?.children.map((c) => c.name);
    expect(children("Utilities & bills")).toEqual([
      "Electricity", "Water", "Cooking gas", "Mobile", "Internet & broadband", "DTH & streaming",
    ]);
    expect(children("Education")).toEqual(["School & college fees", "Tuition & classes", "Books & supplies"]);
    expect(children("Salary")).toEqual(["Salary", "Bonus"]);
    expect(children("Miscellaneous")).toEqual([]);
  });

  it("has unique names among siblings and valid colour and icon keys", () => {
    for (const kind of ["expense", "income"]) {
      const names = parents(kind).map((c) => c.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    }
    for (const parent of DEFAULT_CATEGORIES) {
      const names = parent.children.map((c) => c.name.toLowerCase());
      expect(new Set(names).size, parent.name).toBe(names.length);
      expect(ACCOUNT_COLOUR_KEYS).toContain(parent.colour);
      for (const icon of [parent.icon, ...parent.children.map((c) => c.icon)]) expect(APPEARANCE_ICON_KEYS).toContain(icon);
    }
  });

  it("passes the category schema", () => {
    for (const parent of DEFAULT_CATEGORIES) {
      const { children, ...fields } = parent;
      expect(CategoryCreateFields.safeParse(fields).success, parent.name).toBe(true);
      for (const child of children) {
        expect(CategoryCreateFields.safeParse({ ...child, kind: parent.kind, colour: parent.colour }).success, child.name).toBe(true);
      }
    }
  });
});
