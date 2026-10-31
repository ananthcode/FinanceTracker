/**
 * Deterministic demo transactions (R4 research R4-10, constitution X). Synthetic only. Uses the R2
 * demo accounts and R3 demo lists by their fixed ids, from the demo opening date (01-Apr-2025) to the
 * month of `todayIso`. The same `todayIso` always gives the same data; R5's loader inserts it.
 *
 * Every month: salary, rent, a cash withdrawal, weekly groceries, electricity, fuel on the card and
 * the card bill paid by transfer, eating out from the wallet; and in turn a split bill, a refund, and
 * each person action (lent, received back, paid / collected on behalf, borrowed, repaid, an
 * adjustment, manual interest). Ravi Kumar has automatic interest at 1% a month (rates); the app
 * proposes it. Older entries are Cleared; one is Void, one Follow-up; next month's rent is upcoming
 * and one bill waits in "To confirm".
 */
import { categoryPath, indexCategories } from "../categories/tree";
import type { PersonRateView, TransactionLine, TransactionView } from "../transactions/types";
import { demoAccounts } from "./accounts";
import { demoLists } from "./lists";

const START = "2025-04-01";

const txId = (n: number) => `00000000-0000-4000-8000-e${n.toString(16).padStart(11, "0")}`;
const lineId = (n: number) => `00000000-0000-4000-8000-f${n.toString(16).padStart(11, "0")}`;

function monthsFrom(first: string, todayIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${first}T00:00:00Z`);
  const last = `${todayIso.slice(0, 7)}-01`;
  while (d.toISOString().slice(0, 10) <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}
const day = (month: string, n: number) => `${month.slice(0, 8)}${String(n).padStart(2, "0")}`;
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface DemoTransactions {
  transactions: TransactionView[];
  rates: PersonRateView[];
}

export function demoTransactions(todayIso: string): DemoTransactions {
  const { accounts } = demoAccounts();
  const { categories, payees, tags } = demoLists();
  const index = indexCategories(categories);
  const account = (name: string) => accounts.find((a) => a.name === name)!.id;
  const payee = (name: string) => payees.find((p) => p.name === name)!.id;
  const tag = (name: string) => tags.find((t) => t.name === name)!.id;
  const category = (path: string) => categories.find((c) => categoryPath(c.id, index) === path)!.id;

  const savings = account("Everyday Savings");
  const cash = account("Cash in hand");
  const wallet = account("Mobile Wallet");
  const card = account("Rewards Card");

  const transactions: TransactionView[] = [];
  let n = 0;
  let lines = 0;
  const add = (t: Partial<TransactionView> & Pick<TransactionView, "date" | "kind" | "flow" | "amountMinor">) => {
    const tx: TransactionView = {
      id: txId(++n),
      timeOfDay: null,
      accountId: null,
      toAccountId: null,
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
      ...t,
    };
    // Planned: anything after today waits (FR-002a).
    if (tx.date > todayIso) tx.confirmed = false;
    // Statement-checked: older than two months.
    if (tx.status === "uncleared" && tx.date < addDays(todayIso, -60)) tx.status = "cleared";
    transactions.push(tx);
    return tx;
  };
  const line = (amountMinor: bigint, extra: Partial<TransactionLine>): TransactionLine => ({
    id: lineId(++lines),
    amountMinor,
    categoryId: null,
    personId: null,
    personAction: null,
    notes: null,
    tagIds: [],
    ...extra,
  });
  const vary = (base: bigint, i: number, step: number, spread: number) => base + BigInt(((i * step) % spread) * 100);

  const months = monthsFrom(START, todayIso);
  months.forEach((m, i) => {
    const thisMonth = i === months.length - 1;
    const upTo = (d: string) => !thisMonth || d <= todayIso; // this month: only what has happened
    const at = (dd: number) => day(m, dd);

    add({ date: at(1), kind: "income", flow: "in", accountId: savings, amountMinor: 8_500_000n, payeeId: payee("Acme Payroll"), categoryId: category("Salary › Salary") });
    if (upTo(at(2))) {
      add({ date: at(2), kind: "transfer", flow: "out", accountId: savings, toAccountId: cash, amountMinor: 500_000n, notes: "Cash withdrawal" });
      add({ date: at(2), kind: "transfer", flow: "out", accountId: savings, toAccountId: wallet, amountMinor: 50_000n, notes: "Wallet top-up" });
    }
    if (upTo(at(3))) add({ date: at(3), kind: "expense", flow: "out", accountId: savings, amountMinor: 2_500_000n, categoryId: category("Home › Rent"), notes: "Rent" });
    [5, 12, 19, 26].forEach((dd, w) => {
      if (!upTo(at(dd))) return;
      add({
        date: at(dd), kind: "expense", flow: "out", accountId: w % 2 ? cash : savings, amountMinor: vary(120_000n, i * 4 + w, 37, 900),
        payeeId: payee("Fresh Mart"), categoryId: category("Food & groceries › Groceries"),
        tagIds: m === "2025-10-01" || m === "2025-11-01" ? [tag("Diwali 2025")] : [],
      });
    });
    if (upTo(at(10))) add({ date: at(10), kind: "expense", flow: "out", accountId: savings, amountMinor: vary(180_000n, i, 53, 1200), payeeId: payee("City Power Board"), categoryId: category("Utilities & bills › Electricity"), reference: `CPB-${m.slice(0, 7)}` });
    if (upTo(at(15))) add({ date: at(15), kind: "expense", flow: "out", accountId: card, amountMinor: 250_000n, payeeId: payee("Quick Fuel Station"), categoryId: category("Transport › Fuel") });
    if (upTo(at(20))) add({ date: at(20), kind: "expense", flow: "out", accountId: wallet, amountMinor: vary(45_000n, i, 29, 300), payeeId: payee("Corner Cafe"), categoryId: category("Food & groceries › Eating out") });
    if (upTo(at(25))) add({ date: at(25), kind: "transfer", flow: "out", accountId: savings, toAccountId: card, amountMinor: 250_000n, notes: "Card bill" });

    // In turn through the year.
    const turn = (dd: number) => upTo(at(dd));
    if (i % 3 === 0 && turn(8)) {
      add({
        date: at(8), kind: "expense", flow: "out", accountId: savings, amountMinor: 450_000n, payeeId: payee("Fresh Mart"),
        lines: [
          line(320_000n, { categoryId: category("Food & groceries › Groceries") }),
          line(105_000n, { categoryId: category("Shopping › Household items"), notes: "Cleaning things" }),
          line(25_000n, { categoryId: category("Shopping › Personal care") }),
        ],
      });
    }
    if (i % 4 === 1 && turn(9)) add({ date: at(9), kind: "refund", flow: "in", accountId: savings, amountMinor: 30_000n, payeeId: payee("Fresh Mart"), categoryId: category("Food & groceries › Groceries"), notes: "Returned damaged item" });
    if (i % 5 === 2 && turn(21)) {
      add({
        date: at(21), kind: "expense", flow: "out", accountId: card, amountMinor: 300_000n, payeeId: payee("Corner Cafe"),
        lines: [
          line(100_000n, { categoryId: category("Food & groceries › Eating out") }),
          line(200_000n, { personId: payee("Anil Rao"), personAction: "paid_on_behalf", notes: "Anil's share" }),
        ],
        tagIds: [tag("Reimbursable")],
      });
    }
    const person = (dd: number, action: TransactionView["personAction"], name: string, amount: bigint, accountId: string | null, flow: "in" | "out", notes: string | null = null) => {
      if (turn(dd)) add({ date: at(dd), kind: "person", flow, personAction: action, payeeId: payee(name), accountId, amountMinor: amount, notes });
    };
    switch (i % 7) {
      case 0: person(11, "lent", "Ravi Kumar", 500_000n, savings, "out"); break;
      case 1: person(11, "received_back", "Ravi Kumar", 300_000n, savings, "in"); break;
      case 2: person(11, "paid_on_behalf", "Priya Nair", 120_000n, savings, "out", "Her phone bill"); break;
      case 3: person(11, "borrowed", "Meera Iyer", 1_000_000n, savings, "in"); break;
      case 4: person(11, "repaid_to", "Meera Iyer", 1_000_000n, savings, "out"); break;
      case 5: person(11, "collected_on_behalf", "Priya Nair", 200_000n, cash, "in", "Rent collected for her"); break;
      case 6: person(11, "adjustment", "Anil Rao", 50_000n, null, "in", "Rounded off a shared bill"); break;
    }
    // Manual interest to Meera (the user owes her), each quarter end.
    if (i % 3 === 2 && turn(28)) add({ date: at(28), kind: "interest", flow: "in", payeeId: payee("Meera Iyer"), amountMinor: 6_750n, notes: "Agreed quarterly interest" });
  });

  // One Void (a duplicate entered by mistake) and one to check later.
  const groceries = transactions.filter((t) => t.payeeId === payee("Fresh Mart") && t.kind === "expense" && t.lines.length === 0);
  if (groceries[3]) groceries[3].status = "void";
  if (groceries[groceries.length - 1]) groceries[groceries.length - 1]!.status = "follow_up";
  // Upcoming: next month's rent. Waiting: a school fee dated three days ago, not yet confirmed.
  const next = monthsFrom(START, `${addDays(`${todayIso.slice(0, 7)}-28`, 7)}`).at(-1)!;
  add({ date: day(next, 3), kind: "expense", flow: "out", accountId: savings, amountMinor: 2_500_000n, categoryId: category("Home › Rent"), notes: "Rent" });
  const waiting = addDays(todayIso, -3);
  if (waiting >= START) {
    add({ date: waiting, kind: "expense", flow: "out", accountId: savings, amountMinor: 1_850_000n, payeeId: payee("Greenfield School"), categoryId: category("Education › School & college fees"), confirmed: false, notes: "Term fee" });
  }

  const rates: PersonRateView[] = [
    { id: "00000000-0000-4000-8000-0000000000a1", payeeId: payee("Ravi Kumar"), effectiveMonth: START, rateE4: 10_000 },
    { id: "00000000-0000-4000-8000-0000000000a2", payeeId: payee("Meera Iyer"), effectiveMonth: START, rateE4: 15_000 },
  ];
  return { transactions, rates };
}
