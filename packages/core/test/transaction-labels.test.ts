import { describe, expect, it } from "vitest";
import type { CategoryView } from "../src/categories";
import { categoryTotals, PERSON_ACTION_TEXT, transactionLabel, type TransactionView } from "../src/transactions";

/** R4 T022 — plain-language descriptions (FR-011, FR-016, contracts/client-transactions.md) and category totals (FR-009). */
const names = {
  account: (id: string) => ({ a1: "Everyday Savings", card: "Rewards Card" })[id] ?? "",
  payee: (id: string) => ({ shop: "Fresh Mart", pay: "Acme Payroll", ravi: "Ravi Kumar" })[id] ?? "",
};

function tx(partial: Partial<TransactionView>): TransactionView {
  return {
    id: "t",
    date: "2026-10-05",
    timeOfDay: null,
    kind: "expense",
    flow: "out",
    accountId: "a1",
    toAccountId: null,
    amountMinor: 1000n,
    payeeId: null,
    personAction: null,
    categoryId: null,
    lines: [],
    tagIds: [],
    notes: null,
    reference: null,
    status: "uncleared",
    confirmed: true,
    generated: false,
    interestMonth: null,
    userEdited: false,
    state: "active",
    ...partial,
  };
}

describe("transactionLabel", () => {
  it.each([
    [{ kind: "expense", payeeId: "shop" }, "Spent at Fresh Mart"],
    [{ kind: "expense" }, "Spent"],
    [{ kind: "income", flow: "in", payeeId: "pay" }, "Received from Acme Payroll"],
    [{ kind: "income", flow: "in" }, "Received"],
    [{ kind: "refund", flow: "in", payeeId: "shop" }, "Refund from Fresh Mart"],
    [{ kind: "transfer", toAccountId: "card" }, "Transferred from Everyday Savings to Rewards Card"],
    [{ kind: "person", personAction: "lent", payeeId: "ravi" }, "Lent to Ravi Kumar"],
    [{ kind: "person", personAction: "repaid_to", payeeId: "ravi" }, "Repaid to Ravi Kumar"],
    [{ kind: "person", personAction: "paid_on_behalf", payeeId: "ravi" }, "Paid on behalf of Ravi Kumar"],
    [{ kind: "person", flow: "in", personAction: "borrowed", payeeId: "ravi" }, "Borrowed from Ravi Kumar"],
    [{ kind: "person", flow: "in", personAction: "received_back", payeeId: "ravi" }, "Received back from Ravi Kumar"],
    [{ kind: "person", flow: "in", personAction: "collected_on_behalf", payeeId: "ravi" }, "Collected on behalf of Ravi Kumar"],
    [{ kind: "person", flow: "out", personAction: "adjustment", accountId: null, payeeId: "ravi" }, "Adjustment: Ravi Kumar owes you more"],
    [{ kind: "person", flow: "in", personAction: "adjustment", accountId: null, payeeId: "ravi" }, "Adjustment: you owe Ravi Kumar more"],
    [{ kind: "interest", flow: "out", accountId: null, payeeId: "ravi" }, "Interest charged to Ravi Kumar"],
    [{ kind: "interest", flow: "in", accountId: null, payeeId: "ravi" }, "Interest owed to Ravi Kumar"],
  ] as [Partial<TransactionView>, string][])("%o → %s", (partial, expected) => {
    expect(transactionLabel(tx(partial), names)).toBe(expected);
  });

  it("names every person action in plain words", () => {
    expect(Object.keys(PERSON_ACTION_TEXT).sort()).toEqual(
      ["adjustment", "borrowed", "collected_on_behalf", "lent", "paid_on_behalf", "received_back", "repaid_to"],
    );
  });
});

describe("categoryTotals", () => {
  const cat = (id: string, kind: "expense" | "income", parentId: string | null = null): CategoryView =>
    ({ id, name: id, kind, parentId, colour: "green", icon: "utensils", hidden: false }) as CategoryView;
  const categories = [cat("food", "expense"), cat("groceries", "expense", "food"), cat("eating", "expense", "food"), cat("salary", "income")];

  it("rolls sub-categories up, takes refunds off spending, keeps Uncategorised and skips what does not count", () => {
    const list = [
      tx({ kind: "expense", amountMinor: 123450n, categoryId: "groceries" }),
      tx({ kind: "refund", flow: "in", amountMinor: 50000n, categoryId: "groceries" }),
      tx({ kind: "expense", amountMinor: 30000n, categoryId: "food" }),
      tx({ kind: "expense", amountMinor: 300000n, lines: [
        { id: "l1", amountMinor: 100000n, categoryId: "eating", personId: null, personAction: null, notes: null, tagIds: [] },
        { id: "l2", amountMinor: 200000n, categoryId: null, personId: "ravi", personAction: "paid_on_behalf", notes: null, tagIds: [] },
      ] }),
      tx({ kind: "expense", amountMinor: 5000n }),
      tx({ kind: "income", flow: "in", amountMinor: 8500000n, categoryId: "salary" }),
      tx({ kind: "transfer", toAccountId: "card", amountMinor: 99n }),
      tx({ kind: "expense", amountMinor: 7n, categoryId: "groceries", status: "void" }),
      tx({ kind: "expense", amountMinor: 7n, categoryId: "groceries", confirmed: false }),
      tx({ kind: "expense", amountMinor: 7n, categoryId: "groceries", date: "2026-09-30" }),
    ];
    const totals = categoryTotals(list, categories, { from: "2026-10-01", to: "2026-10-31" });
    expect(totals.expense.get("groceries")).toEqual({ own: 73450n, total: 73450n });
    expect(totals.expense.get("food")).toEqual({ own: 30000n, total: 203450n });
    expect(totals.expense.get("eating")).toEqual({ own: 100000n, total: 100000n });
    expect(totals.expense.get("uncategorised")).toEqual({ own: 5000n, total: 5000n });
    expect(totals.income.get("salary")).toEqual({ own: 8500000n, total: 8500000n });
    expect(totals.spending).toBe(208450n);
    expect(totals.earning).toBe(8500000n);
  });
});
