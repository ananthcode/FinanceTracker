/**
 * The demo household's payment plan (R7 research R7-11, FR-019, constitution X). Synthetic only.
 * Deterministic for a given `todayIso`, like the rest of the demo data.
 *
 * - Rent, electricity (amount varies) and the Rewards Card bill (amount varies) run since the demo's
 *   start and are paid through links to the demo's existing monthly transactions.
 * - Last month's electricity is left unlinked on purpose: it shows as Overdue, carried into this
 *   month, with a likely payment to link.
 * - The home loan EMI, school fees (every 3 months, its fee waiting in "To confirm" is linked), the
 *   repayment to Meera and a streaming subscription start this month; the car loan EMI next month;
 *   car insurance yearly from the next March. So no other month before this one is left unpaid.
 * - Next month's rent is already linked (an upcoming payment), and the subscription skips next month.
 * - "Plan checked" is left empty, so the month-check nudge shows in its window.
 */
import { categoryPath, indexCategories } from "../categories/tree";
import { addMonths, monthOf } from "../plan/months";
import type { Month, PlanItem, PlanOccurrence } from "../plan/schemas";
import type { TransactionView } from "../transactions/types";
import { demoAccounts } from "./accounts";
import { demoLists } from "./lists";

const planId = (n: number) => `00000000-0000-4000-8000-00000000b${String(n).padStart(3, "0")}`;
const occurrenceDemoId = (n: number) => `00000000-0000-4000-8000-00000000b${String(100 + n).padStart(3, "0")}`;

export const DEMO_PLAN_START: Month = "2025-04-01";

export interface DemoPlan {
  items: PlanItem[];
  /** Ids here are placeholders; the change builder derives the real ones from the item and month. */
  occurrences: PlanOccurrence[];
  /** Which demo transaction pays which item-month. */
  links: Map<string, { planItemId: string; planMonth: Month }>;
}

export function demoPlan(todayIso: string, transactions: readonly TransactionView[]): DemoPlan {
  const { accounts } = demoAccounts();
  const { categories, payees } = demoLists();
  const index = indexCategories(categories);
  const account = (name: string) => accounts.find((a) => a.name === name)!.id;
  const payee = (name: string) => payees.find((p) => p.name === name)!.id;
  const category = (path: string) => categories.find((c) => categoryPath(c.id, index) === path)!.id;
  const savings = account("Everyday Savings");
  const card = account("Rewards Card");

  const thisMonth = monthOf(todayIso);
  const nextMonth = addMonths(thisMonth, 1);
  const lastMonth = addMonths(thisMonth, -1);
  const nextMarch = (() => {
    let m = thisMonth;
    while (m.slice(5, 7) !== "03") m = addMonths(m, 1);
    return m;
  })();

  let n = 0;
  const item = (p: Omit<PlanItem, "id" | "terms" | "state" | "notes" | "endMonth" | "categoryId" | "payeeId" | "cardAccountId" | "personAction"> &
    Partial<PlanItem> & { amountMinor: bigint | null; dueDay: number; accountId: string }): PlanItem => {
    const { amountMinor, dueDay, accountId, ...rest } = p;
    return {
      id: planId(++n),
      payeeId: null,
      categoryId: null,
      cardAccountId: null,
      personAction: null,
      endMonth: null,
      notes: null,
      state: "active",
      ...rest,
      terms: [{ fromMonth: p.startMonth, amountMinor, dueDay, accountId }],
    };
  };

  const rent = item({ name: "Rent", target: "payee", payeeId: payee("Sunrise Apartments"), categoryId: category("Home › Rent"), frequency: "monthly", intervalMonths: 1, startMonth: DEMO_PLAN_START, amountVaries: false, amountMinor: 2_500_000n, dueDay: 3, accountId: savings });
  const power = item({ name: "Electricity", target: "payee", payeeId: payee("City Power Board"), categoryId: category("Utilities & bills › Electricity"), frequency: "monthly", intervalMonths: 1, startMonth: DEMO_PLAN_START, amountVaries: true, amountMinor: 180_000n, dueDay: 10, accountId: savings });
  const cardBill = item({ name: "Rewards Card bill", target: "card", cardAccountId: card, frequency: "monthly", intervalMonths: 1, startMonth: DEMO_PLAN_START, amountVaries: true, amountMinor: null, dueDay: 25, accountId: savings });
  const homeLoan = item({ name: "Home loan EMI", target: "payee", payeeId: payee("HomeFirst Finance"), categoryId: category("Interest paid › Loan interest"), frequency: "monthly", intervalMonths: 1, startMonth: thisMonth, amountVaries: false, amountMinor: 4_250_000n, dueDay: 28, accountId: savings });
  const carLoan = item({ name: "Car loan EMI", target: "payee", payeeId: payee("AutoLease Finance"), categoryId: category("Interest paid › Loan interest"), frequency: "monthly", intervalMonths: 1, startMonth: nextMonth, amountVaries: false, amountMinor: 1_200_000n, dueDay: 7, accountId: savings });
  const fees = item({ name: "School fees", target: "payee", payeeId: payee("Greenfield School"), categoryId: category("Education › School & college fees"), frequency: "every_n_months", intervalMonths: 3, startMonth: thisMonth, amountVaries: false, amountMinor: 1_850_000n, dueDay: 15, accountId: savings });
  const insurance = item({ name: "Car insurance", target: "payee", payeeId: payee("SafeDrive Insurance"), categoryId: category("Insurance › Vehicle insurance"), frequency: "yearly", intervalMonths: 12, startMonth: nextMarch, amountVaries: false, amountMinor: 1_800_000n, dueDay: 31, accountId: savings });
  const meera = item({ name: "Repay Meera", target: "person", payeeId: payee("Meera Iyer"), personAction: "repaid_to", frequency: "monthly", intervalMonths: 1, startMonth: thisMonth, amountVaries: false, amountMinor: 500_000n, dueDay: 20, accountId: savings, notes: "₹5,000.00 a month until settled" });
  const stream = item({ name: "Stream Plus", target: "payee", payeeId: payee("Stream Plus"), categoryId: category("Entertainment › Subscriptions"), frequency: "monthly", intervalMonths: 1, startMonth: thisMonth, amountVaries: false, amountMinor: 64_900n, dueDay: 12, accountId: card });
  const items = [rent, power, cardBill, homeLoan, carLoan, fees, insurance, meera, stream];

  const occurrences: PlanOccurrence[] = [{ id: occurrenceDemoId(1), itemId: stream.id, month: nextMonth, amountMinor: null, skipped: true }];

  const links = new Map<string, { planItemId: string; planMonth: Month }>();
  const link = (t: TransactionView, it: PlanItem) => links.set(t.id, { planItemId: it.id, planMonth: monthOf(t.date) });
  for (const t of transactions) {
    if (t.kind === "expense" && t.categoryId === rent.categoryId && t.notes === "Rent") link(t, rent);
    else if (t.kind === "expense" && t.payeeId === power.payeeId && monthOf(t.date) !== lastMonth) link(t, power);
    else if (t.kind === "transfer" && t.toAccountId === card && t.notes === "Card bill") link(t, cardBill);
    else if (t.kind === "expense" && t.payeeId === fees.payeeId && !t.confirmed) links.set(t.id, { planItemId: fees.id, planMonth: thisMonth });
  }
  return { items, occurrences, links };
}
