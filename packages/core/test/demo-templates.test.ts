import { describe, expect, it } from "vitest";
import { demoPlan, demoTemplates, demoTransactions, templateFitsPlan, TemplateCreateFields, templateToWire, visibleTemplates } from "../src";

/** R8 T014 — the demo household's templates (FR-016). */
describe("demoTemplates", () => {
  const plan = demoPlan("2026-11-14", demoTransactions("2026-11-14").transactions);
  const templates = demoTemplates(plan.items);

  it("is valid on the wire and in a set order", () => {
    for (const t of templates) {
      const parsed = TemplateCreateFields.safeParse(templateToWire(t));
      expect(parsed.success, `${t.name}: ${parsed.success ? "" : parsed.error.issues[0]?.message}`).toBe(true);
    }
    expect(visibleTemplates(templates).map((t) => t.name)).toEqual(["Milk", "Groceries", "Fuel", "Wallet top-up", "Repay Meera"]);
  });

  it("has one-tap and amount-each-time templates, and one tied to a planned payment that it fits", () => {
    expect(templates.find((t) => t.name === "Groceries")!.amountMinor).toBeNull();
    const tied = templates.find((t) => t.planItemId !== null)!;
    expect(tied.name).toBe("Repay Meera");
    expect(templateFitsPlan(tied, plan.items.find((i) => i.id === tied.planItemId)!)).toBe(true);
  });
});
