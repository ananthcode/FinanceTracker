import { describe, expect, it } from "vitest";
import { personStatement, statementClosing, statementDocument, statementFileName, type TransactionView } from "../src";
import { toTransaction } from "./postings.test";
import vectors from "./vectors/statements.json";

/** R6 T016 — person statements (FR-009, FR-010, FR-012; spec US4 1, 2, 4; research R6-05). */
type VectorTx = Parameters<typeof toTransaction>[0];
const full = (t: VectorTx): TransactionView => ({ ...toTransaction(t), notes: (t.notes as string) ?? null });
/** As the search returns them. */
const newestFirst: TransactionView[] = (vectors.transactions as VectorTx[]).map(full).reverse();
const person = {
  id: vectors.person.id,
  name: vectors.person.name,
  openingBalanceMinor: BigInt(vectors.person.openingBalanceMinor),
  statementSign: "they_owe_positive" as const,
};
const business = (id: string) => (vectors.businesses as Record<string, string>)[id] ?? "";
const flip = (minor: string) => (minor.startsWith("-") ? minor.slice(1) : `-${minor}`);

describe("personStatement", () => {
  it("opens at the balance before the range, lists counted movements in date order and closes at the range's end (US4 1)", () => {
    const s = personStatement(person, newestFirst, vectors.april.range, business);
    expect(s.openingMinor.toString()).toBe(vectors.april.openingMinor);
    expect(
      s.rows.map((r) => ({ ...r, amountMinor: r.amountMinor.toString(), balanceMinor: r.balanceMinor.toString() })),
    ).toEqual(vectors.april.rows);
    expect(s.closingMinor.toString()).toBe(vectors.april.closingMinor);
    expect(statementClosing(person.name, s.realClosingMinor)).toEqual({
      words: vectors.april.closingWords,
      amountMinor: BigInt(vectors.april.closingAmountMinor),
    });
  });

  it('"I owe them is positive" flips every figure; the closing words keep the real direction (US4 2)', () => {
    const s = personStatement({ ...person, statementSign: "i_owe_positive" }, newestFirst, vectors.april.range, business);
    expect(s.openingMinor.toString()).toBe(flip(vectors.april.openingMinor));
    expect(s.rows.map((r) => r.amountMinor.toString())).toEqual(vectors.april.rows.map((r) => flip(r.amountMinor)));
    expect(s.rows.map((r) => r.balanceMinor.toString())).toEqual(vectors.april.rows.map((r) => flip(r.balanceMinor)));
    expect(s.closingMinor.toString()).toBe(flip(vectors.april.closingMinor));
    expect(statementClosing(person.name, s.realClosingMinor).words).toBe(vectors.april.closingWords);
  });

  it("a range with no movements opens and closes the same (US4 4)", () => {
    const s = personStatement(person, newestFirst, vectors.emptyRange.range, business);
    expect(s.rows).toEqual([]);
    expect(s.openingMinor.toString()).toBe(vectors.emptyRange.openingMinor);
    expect(s.closingMinor.toString()).toBe(vectors.emptyRange.closingMinor);
  });

  it("a range starting before the opening date starts from the opening balance", () => {
    const before = personStatement(person, newestFirst, vectors.beforeOpening.range, business);
    expect(before.openingMinor.toString()).toBe(vectors.beforeOpening.openingMinor);
    expect(before.closingMinor.toString()).toBe(vectors.beforeOpening.closingMinor);
    const straddles = personStatement(person, newestFirst, vectors.straddlesOpening.range, business);
    expect(straddles.openingMinor.toString()).toBe(vectors.straddlesOpening.openingMinor);
    expect(straddles.rows).toHaveLength(vectors.straddlesOpening.rows);
    expect(straddles.closingMinor.toString()).toBe(vectors.straddlesOpening.closingMinor);
  });

  it("orders one day by time, keeps the search's entry order otherwise, and adds a person's lines in one row", () => {
    const base = newestFirst.find((t) => t.id === "t1")!;
    const day = "2026-07-01";
    const rows: TransactionView[] = [
      { ...base, id: "second-entry", date: day, timeOfDay: null },
      { ...base, id: "first-entry", date: day, timeOfDay: null },
      { ...base, id: "evening", date: day, timeOfDay: "20:00" },
      { ...base, id: "morning", date: day, timeOfDay: "08:00" },
    ];
    const s = personStatement(person, rows, { from: day, to: day }, business);
    expect(s.rows.map((r) => r.transactionId)).toEqual(["first-entry", "second-entry", "morning", "evening"]);

    const split = newestFirst.find((t) => t.id === "t3")!;
    const line = split.lines[0]!;
    const twice: TransactionView = { ...split, lines: [line, { ...line, id: "l3" }, split.lines[1]!] };
    const one = personStatement(person, [twice], { from: split.date, to: split.date }, business);
    expect(one.rows).toHaveLength(1);
    expect(one.rows[0]!.amountMinor).toBe(20000n);
  });

  it("never names an account, and leaves out a payee the caller does not name (US4 3)", () => {
    const noOtherPerson = personStatement(person, newestFirst, vectors.april.range, () => "");
    expect(noOtherPerson.rows[0]!.label).toBe("Share of spending");
    expect(JSON.stringify(noOtherPerson.rows.map((r) => r.label))).not.toContain("a1");
  });
});

describe("statementDocument", () => {
  const statement = personStatement(person, newestFirst, vectors.april.range, business);
  const input = {
    personName: person.name,
    displayName: "Asha",
    currency: "INR",
    prefs: { numberFormat: "indian" as const, dateFormat: "dd-MMM-yyyy" as const },
    includeNotes: false,
  };

  it("has the display name, person, range, every row and the closing balance, in real amounts (US4 3)", () => {
    const doc = statementDocument(statement, input);
    expect(doc.title).toBe("Statement for Ravi Kumar");
    expect(doc.source).toBe("From Asha");
    expect(doc.range).toBe("01-Apr-2026 to 30-Apr-2026");
    expect(doc.meaning).toBe("Positive amounts mean Ravi Kumar owes you.");
    expect(doc.opening).toBe("₹400.00");
    expect(doc.rows.map((r) => [r.date, r.label, r.amount, r.balance])).toEqual([
      ["02-Apr-2026", "Share of spending at Fresh Mart", "+₹100.00", "₹500.00"],
      ["10-Apr-2026", "Received back from Ravi Kumar", "−₹800.00", "−₹300.00"],
      ["15-Apr-2026", "Interest charged to Ravi Kumar", "+₹5.00", "−₹295.00"],
    ]);
    expect(doc.closing).toBe("You owe Ravi Kumar ₹295.00");
    expect(doc.empty).toBeNull();
  });

  it("leaves notes out unless they are turned on (clarified 2026-11-01)", () => {
    expect(statementDocument(statement, input).rows.every((r) => r.notes === null)).toBe(true);
    expect(JSON.stringify(statementDocument(statement, input))).not.toContain("Dinner");
    expect(statementDocument(statement, { ...input, includeNotes: true }).rows[0]!.notes).toBe("Dinner");
  });

  it("says when there were no movements, and when they are settled (US4 4)", () => {
    const empty = personStatement({ ...person, openingBalanceMinor: 0n }, [], vectors.emptyRange.range, business);
    const doc = statementDocument(empty, input);
    expect(doc.rows).toEqual([]);
    expect(doc.empty).toBe("No movements in this period.");
    expect(doc.closing).toBe("Settled with Ravi Kumar");
  });

  it("names the file after the person and the range, keeping only safe characters (FR-011)", () => {
    expect(statementFileName("Ravi Kumar", "2026-04-01", "2026-10-31", "pdf")).toBe("Statement - Ravi Kumar - 2026-04-01 to 2026-10-31.pdf");
    expect(statementFileName("Ravi/../K:R", "2026-04-01", "2026-10-31", "png")).toBe("Statement - Ravi..KR - 2026-04-01 to 2026-10-31.png");
    expect(statementFileName("///", "2026-04-01", "2026-10-31", "png")).toBe("Statement - person - 2026-04-01 to 2026-10-31.png");
  });
});

describe("statementClosing", () => {
  it("says the balance in words", () => {
    expect(statementClosing("Ravi", 500n)).toEqual({ words: "Ravi owes you", amountMinor: 500n });
    expect(statementClosing("Ravi", -500n)).toEqual({ words: "You owe Ravi", amountMinor: 500n });
    expect(statementClosing("Ravi", 0n)).toEqual({ words: "Settled with Ravi", amountMinor: null });
  });
});
