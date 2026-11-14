import { describe, expect, it } from "vitest";
import {
  PreferencesUpdate,
  TransactionCreateFields,
  TransactionUpdateFields,
  sortWarranties,
  warrantyDaysLeft,
  warrantyProblem,
  warrantyReminder,
  warrantyTimeLeft,
} from "../src";

const prefs = { warrantyFirstDays: 60, warrantySecondDays: 30 };

describe("reminders (clarify Q3, R9-06)", () => {
  const until = "2026-12-31";
  it("comes first at 60 days, again at 30, and not after expiry", () => {
    expect(warrantyDaysLeft("2026-11-01", until)).toBe(60);
    expect(warrantyReminder("2026-10-31", until, 0, prefs)).toBeNull(); // 61 days
    expect(warrantyReminder("2026-11-01", until, 0, prefs)).toBe(1);
    expect(warrantyReminder("2026-11-01", until, 1, prefs)).toBeNull(); // Got it
    expect(warrantyReminder("2026-11-30", until, 1, prefs)).toBeNull(); // 31 days
    expect(warrantyReminder("2026-12-01", until, 1, prefs)).toBe(2);
    expect(warrantyReminder("2026-12-01", until, 0, prefs)).toBe(2); // the first was never dismissed
    expect(warrantyReminder("2026-12-31", until, 1, prefs)).toBe(2); // the last day
    expect(warrantyReminder("2026-12-01", until, 2, prefs)).toBeNull();
    expect(warrantyReminder("2027-01-01", until, 0, prefs)).toBeNull(); // expired
    expect(warrantyReminder("2026-12-01", null, 0, prefs)).toBeNull();
  });

  it("follows the chosen days, with the second off", () => {
    const off = { warrantyFirstDays: 90, warrantySecondDays: null };
    expect(warrantyReminder("2026-10-02", until, 0, off)).toBe(1); // 90 days
    expect(warrantyReminder("2026-12-30", until, 1, off)).toBeNull();
  });

  it("accepts only reminder pairs with the second closer to expiry", () => {
    expect(PreferencesUpdate.safeParse({ warrantyFirstDays: 90, warrantySecondDays: null }).success).toBe(true);
    expect(PreferencesUpdate.safeParse({ warrantyFirstDays: 30, warrantySecondDays: 15 }).success).toBe(true);
    expect(PreferencesUpdate.safeParse({ warrantyFirstDays: 30, warrantySecondDays: 30 }).success).toBe(false);
    expect(PreferencesUpdate.safeParse({ warrantyFirstDays: 45, warrantySecondDays: 15 }).success).toBe(false);
    expect(PreferencesUpdate.safeParse({ warrantyFirstDays: 60 }).success).toBe(false);
  });
});

describe("time left in words (FR-009)", () => {
  it("speaks in months, days and years", () => {
    expect(warrantyTimeLeft("2026-11-14", "2027-02-14")).toBe("3 months left");
    expect(warrantyTimeLeft("2026-11-14", "2026-11-26")).toBe("expires in 12 days");
    expect(warrantyTimeLeft("2026-11-14", "2026-11-15")).toBe("expires in 1 day");
    expect(warrantyTimeLeft("2026-11-14", "2026-11-14")).toBe("expires today");
    expect(warrantyTimeLeft("2026-11-14", "2026-11-10")).toBe("expired 4 days ago");
    expect(warrantyTimeLeft("2026-11-14", "2028-11-14")).toBe("2 years left");
    expect(warrantyTimeLeft("2026-11-14", "2027-02-13")).toBe("2 months left");
  });

  it("lists active soonest first and expired latest first", () => {
    const row = (id: string, warrantyUntil: string | null) => ({ id, date: "2026-01-01", warrantyUntil });
    const { active, expired } = sortWarranties(
      [row("a", "2027-05-01"), row("b", "2026-12-01"), row("c", null), row("d", "2026-10-01"), row("e", "2026-11-01")],
      "2026-11-14",
    );
    expect(active.map((r) => r.id)).toEqual(["b", "a"]);
    expect(expired.map((r) => r.id)).toEqual(["e", "d"]);
  });
});

describe("warranty fields (R9-05)", () => {
  const base = { kind: "expense", date: "2026-11-14", accountId: crypto.randomUUID(), amountMinor: "4500000" };
  it("ends on or after the purchase, within 30 years, with a note only alongside a date", () => {
    expect(warrantyProblem("2026-11-14", "2028-11-14", "2 years")).toBeNull();
    expect(warrantyProblem("2026-11-14", "2026-11-13", null)).toMatch(/before/);
    expect(warrantyProblem("2026-11-14", "2056-11-15", null)).toMatch(/30 years/);
    expect(warrantyProblem("2026-11-14", null, "note")).toMatch(/expiry/);
  });

  it("travels with a new transaction or an edit, date and note together", () => {
    expect(TransactionCreateFields.safeParse({ ...base, warrantyUntil: "2028-11-14", warrantyNote: null }).success).toBe(true);
    expect(TransactionCreateFields.safeParse({ ...base, warrantyUntil: "2028-11-14" }).success).toBe(false);
    expect(TransactionCreateFields.safeParse(base).success).toBe(true);
    expect(TransactionUpdateFields.safeParse({ warrantyUntil: "2028-11-14", warrantyNote: "Brand" }).success).toBe(true);
    expect(TransactionUpdateFields.safeParse({ warrantyUntil: null, warrantyNote: null }).success).toBe(true);
    expect(TransactionUpdateFields.safeParse({ warrantyUntil: null, warrantyNote: "x" }).success).toBe(false);
    expect(TransactionUpdateFields.safeParse({ warrantyDismissed: 1 }).success).toBe(true);
    expect(TransactionUpdateFields.safeParse({ warrantyDismissed: 3 }).success).toBe(false);
  });
});
