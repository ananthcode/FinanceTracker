import { describe, expect, it } from "vitest";
import { summarise } from "../src/accounts";
import { buildCategoryTree, CategoryCreateFields, DEFAULT_CATEGORY_COUNT, flattenTree } from "../src/categories";
import { demoAccounts, demoLists } from "../src/demo";
import { PayeeCreateFields } from "../src/payees";
import { peopleTotals, personLabel } from "../src/people";
import { TagFields } from "../src/tags";

/** R3 T075 — the deterministic demo lists (constitution X, research R3-15). */
describe("demoLists", () => {
  const demo = demoLists();

  it("is deterministic", () => {
    expect(demoLists()).toEqual(demoLists());
  });

  it("holds the defaults plus custom categories three levels deep and one hidden", () => {
    expect(demo.categories.length).toBe(DEFAULT_CATEGORY_COUNT + 3);
    const nodes = flattenTree(buildCategoryTree(demo.categories).expense);
    expect(nodes.find((c) => c.name === "Swimming classes")?.path).toBe("Education › Kids › Swimming classes");
    expect(demo.categories.filter((c) => c.hidden).map((c) => c.name)).toEqual(["Tuition & classes"]);
    expect(new Set(demo.categories.map((c) => c.id)).size).toBe(demo.categories.length);
  });

  it("is valid data for every record", () => {
    for (const c of demo.categories) {
      const { name, kind, parentId, colour, icon, hidden } = c;
      expect(CategoryCreateFields.safeParse({ name, kind, parentId, colour, icon, hidden }).success, name).toBe(true);
    }
    for (const t of demo.tags) expect(TagFields.safeParse({ name: t.name }).success, t.name).toBe(true);
    for (const p of demo.payees) {
      const parsed = PayeeCreateFields.safeParse({
        name: p.name,
        kind: p.kind,
        defaultCategoryId: p.defaultCategoryId,
        notes: p.notes,
        hidden: p.hidden,
        openingBalanceMinor: p.openingBalanceMinor.toString(),
        openingBalanceDate: p.openingBalanceDate,
        includeInNetWorth: p.includeInNetWorth,
      });
      expect(parsed.success, p.name).toBe(true);
    }
    const categoryIds = new Set(demo.categories.map((c) => c.id));
    for (const p of demo.payees) if (p.defaultCategoryId) expect(categoryIds.has(p.defaultCategoryId), p.name).toBe(true);
  });

  it("exercises every person label, both totals, a hidden person and the net-worth switch", () => {
    const people = demo.payees.filter((p) => p.kind === "person");
    expect(new Set(people.map((p) => personLabel(p.openingBalanceMinor)))).toEqual(new Set(["owes_you", "you_owe", "settled"]));
    expect(people.some((p) => p.hidden && p.openingBalanceMinor !== 0n)).toBe(true);
    expect(peopleTotals(people)).toEqual({ owedToYou: 4_075_050n, youOwe: 450_000n });
    const withPeople = summarise(demoAccounts().accounts, { view: "by_type", people });
    const without = summarise(demoAccounts().accounts, { view: "by_type" });
    expect(withPeople.owned - without.owned).toBe(1_500_000n); // only Ravi Kumar is switched in
  });
});
