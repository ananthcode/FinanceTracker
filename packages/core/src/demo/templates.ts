/**
 * The demo household's quick-add templates (R8 FR-016, constitution X). Synthetic only; deterministic.
 * Milk (one tap), Groceries (amount each time), Fuel on the card, a wallet top-up, and the monthly
 * repayment to Meera tied to the plan's "Repay Meera".
 */
import { categoryPath, indexCategories } from "../categories/tree";
import { keysBetween } from "../ordering/keys";
import type { PlanItem } from "../plan/schemas";
import type { TemplateView } from "../templates/schemas";
import { demoAccounts } from "./accounts";
import { demoLists } from "./lists";

const templateId = (n: number) => `00000000-0000-4000-8000-00000000c${String(n).padStart(3, "0")}`;

export function demoTemplates(planItems: readonly PlanItem[]): TemplateView[] {
  const { accounts } = demoAccounts();
  const { categories, payees } = demoLists();
  const index = indexCategories(categories);
  const account = (name: string) => accounts.find((a) => a.name === name)!.id;
  const payee = (name: string) => payees.find((p) => p.name === name)!.id;
  const category = (path: string) => categories.find((c) => categoryPath(c.id, index) === path)!.id;
  const keys = keysBetween(null, null, 5);
  const base = { toAccountId: null, personAction: null, categoryId: null, lines: [], tagIds: [], notes: null, planItemId: null, hidden: false, state: "active" as const };
  return [
    { ...base, id: templateId(1), name: "Milk", kind: "expense", flow: "out", accountId: account("Cash in hand"), amountMinor: 6_000n, payeeId: payee("Sunrise Dairy"), categoryId: category("Food & groceries › Milk & dairy"), sortKey: keys[0]! },
    { ...base, id: templateId(2), name: "Groceries", kind: "expense", flow: "out", accountId: account("Everyday Savings"), amountMinor: null, payeeId: payee("Fresh Mart"), categoryId: category("Food & groceries › Groceries"), sortKey: keys[1]! },
    { ...base, id: templateId(3), name: "Fuel", kind: "expense", flow: "out", accountId: account("Rewards Card"), amountMinor: 250_000n, payeeId: payee("Quick Fuel Station"), categoryId: category("Transport › Fuel"), sortKey: keys[2]! },
    { ...base, id: templateId(4), name: "Wallet top-up", kind: "transfer", flow: "out", accountId: account("Everyday Savings"), toAccountId: account("Mobile Wallet"), amountMinor: 50_000n, payeeId: null, notes: "Wallet top-up", sortKey: keys[3]! },
    {
      ...base, id: templateId(5), name: "Repay Meera", kind: "person", flow: "out", accountId: account("Everyday Savings"), amountMinor: 500_000n,
      payeeId: payee("Meera Iyer"), personAction: "repaid_to", planItemId: planItems.find((i) => i.name === "Repay Meera")?.id ?? null, sortKey: keys[4]!,
    },
  ];
}
