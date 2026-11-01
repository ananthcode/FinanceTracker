import { isCounted, postingsOf } from "@ft/core";
import { evaluateAmount, pressKey } from "@/lib/calc";
import { hourLabel, planReminders, reminderText } from "@/lib/reminders";
import { byDay, monthSummary, transactionFromRow } from "@/lib/sync/transactions";

/** R4 US8 on the phone: row mapping, Home's month cards and list, and the amount pad's calculator. */

const row = (over: Record<string, unknown>) =>
  transactionFromRow({ id: crypto.randomUUID(), kind: "expense", date: "2026-10-05", amountMinor: "10000", accountId: "a", ...over });

describe("transaction rows", () => {
  it("maps wire rows and derives the flow when the row has none", () => {
    const tx = transactionFromRow({ id: "t", kind: "income", date: "2026-10-01", amountMinor: "250050", accountId: "a", tagIds: ["x"] });
    expect(tx.flow).toBe("in");
    expect(tx.amountMinor).toBe(250050n);
    expect(tx.confirmed).toBe(true);
    expect(tx.state).toBe("active");
    expect(tx.tagIds).toEqual(["x"]);
  });
});

describe("Home month cards and list", () => {
  const txs = [
    row({ kind: "income", amountMinor: "8500000" }),
    row({ kind: "expense", amountMinor: "54000", date: "2026-10-31" }),
    row({ kind: "refund", amountMinor: "4000" }),
    row({ kind: "transfer", amountMinor: "1000000", toAccountId: "b" }),
    row({ kind: "expense", amountMinor: "99999", status: "void" }),
    row({ kind: "expense", amountMinor: "77700", confirmed: false }),
    row({ kind: "expense", amountMinor: "11100", date: "2026-09-30" }),
  ];

  it("counts income and expenses less refunds; ignores transfers, void, unconfirmed and other months", () => {
    expect(monthSummary(txs, "2026-10")).toEqual({ income: 8500000n, expenses: 50000n, cashflow: 8450000n });
  });

  it("groups by day newest first and filters by card", () => {
    const days = byDay(txs, "2026-10", "all");
    expect(days.map((d) => d.date)).toEqual(["2026-10-31", "2026-10-05"]);
    expect(days[0]!.net).toBe(-54000n);
    expect(byDay(txs, "2026-10", "income").flatMap((d) => d.items).map((t) => t.kind)).toEqual(["income"]);
    expect(byDay(txs, "2026-10", "expenses").flatMap((d) => d.items).every((t) => t.kind === "expense" || t.kind === "refund")).toBe(true);
  });
});

describe("amount pad calculator", () => {
  it("evaluates in exact paise with × and ÷ first", () => {
    expect(evaluateAmount("120+45")).toBe(16500n);
    expect(evaluateAmount("100−20×2")).toBe(6000n);
    expect(evaluateAmount("1000÷3")).toBe(33333n);
    expect(evaluateAmount("99.5×2")).toBe(19900n);
    expect(evaluateAmount("10÷0")).toBeNull();
    expect(evaluateAmount("12+")).toBeNull();
  });

  it("keeps the typed text valid", () => {
    const type = (keys: string[]) => keys.reduce(pressKey, "");
    expect(type(["+", "1", "2", "+", "×", "3"])).toBe("12×3");
    expect(type([".", "5", "5", "5"])).toBe("0.55");
    expect(type(["0", "7"])).toBe("7");
    expect(type(["1", ".", "2", ".", "3"])).toBe("1.23");
    expect(type(["4", "5", "back"])).toBe("4");
  });
});

describe("person movements", () => {
  it("lent and received back move the person's balance; borrowed goes the other way", () => {
    const txs = [
      row({ kind: "person", personAction: "lent", payeeId: "p", amountMinor: "50000" }),
      row({ kind: "person", personAction: "received_back", payeeId: "p", amountMinor: "20000" }),
      row({ kind: "person", personAction: "borrowed", payeeId: "q", amountMinor: "10000" }),
    ];
    const totals: Record<string, bigint> = {};
    for (const tx of txs) if (isCounted(tx)) for (const p of postingsOf(tx, () => "bank")) if (p.type === "person") totals[p.personId] = (totals[p.personId] ?? 0n) + p.effect;
    expect(totals).toEqual({ p: 30000n, q: -10000n });
    expect(monthSummary(txs, "2026-10")).toEqual({ income: 0n, expenses: 0n, cashflow: 0n });
  });
});

describe("To confirm reminders", () => {
  it("plans one reminder per future date, soonest first, counting only unconfirmed active entries", () => {
    const txs = [
      row({ date: "2026-11-05", confirmed: false }),
      row({ date: "2026-11-05", confirmed: false }),
      row({ date: "2026-11-03", confirmed: false }),
      row({ date: "2026-11-04", confirmed: true }),
      row({ date: "2026-11-06", confirmed: false, state: "deleted" }),
      row({ date: "2026-11-01", confirmed: false }),
    ];
    expect(planReminders(txs, "2026-11-01")).toEqual([
      { date: "2026-11-03", count: 1 },
      { date: "2026-11-05", count: 2 },
    ]);
  });

  it("never names amounts or payees", () => {
    expect(reminderText(2)).toEqual({ title: "2 entries to confirm", body: "Upcoming entries are due today. Open Finance Tracker to confirm them." });
    expect(reminderText(1).title).toBe("1 entry to confirm");
  });
});

describe("reminder settings", () => {
  it("labels hours in 12-hour time", () => {
    expect([0, 8, 12, 18].map(hourLabel)).toEqual(["12 am", "8 am", "12 pm", "6 pm"]);
  });
});
