import { describe, expect, it } from "vitest";
import { MAX_AMOUNT_MINOR, parseAmountInput } from "../src/money/parse";

/** T004 — amount entry converts text to exact paise at the boundary (FR-003, Principle II, R2-11). */
const ok = (minor: bigint) => ({ ok: true, minor });
const err = (error: string) => ({ ok: false, error });

describe("parseAmountInput", () => {
  it("parses plain amounts exactly", () => {
    expect(parseAmountInput("52340.50")).toEqual(ok(5234050n));
    expect(parseAmountInput("0")).toEqual(ok(0n));
    expect(parseAmountInput("0.05")).toEqual(ok(5n));
    expect(parseAmountInput("12.5")).toEqual(ok(1250n));
    expect(parseAmountInput("  2000 ")).toEqual(ok(200000n));
  });

  it("accepts the rupee sign and either digit grouping", () => {
    expect(parseAmountInput("₹52,340.50")).toEqual(ok(5234050n));
    expect(parseAmountInput("52,340.50")).toEqual(ok(5234050n));
    expect(parseAmountInput("5,23,40,000.00")).toEqual(ok(5234000000n)); // Indian
    expect(parseAmountInput("52,340,000.00")).toEqual(ok(5234000000n)); // international
    expect(parseAmountInput("₹ 1,000")).toEqual(ok(100000n));
  });

  it("refuses badly placed separators", () => {
    expect(parseAmountInput("1,2,3")).toEqual(err("NOT_A_NUMBER"));
    expect(parseAmountInput(",100")).toEqual(err("NOT_A_NUMBER"));
    expect(parseAmountInput("100,")).toEqual(err("NOT_A_NUMBER"));
    expect(parseAmountInput("1,00.00,0")).toEqual(err("NOT_A_NUMBER"));
  });

  it("never rounds: more than two decimals is refused", () => {
    expect(parseAmountInput("1,234.567")).toEqual(err("TOO_MANY_DECIMALS"));
    expect(parseAmountInput("0.001")).toEqual(err("TOO_MANY_DECIMALS"));
  });

  it("allows a minus sign only when negative amounts are allowed", () => {
    expect(parseAmountInput("-500")).toEqual(err("NEGATIVE_NOT_ALLOWED"));
    expect(parseAmountInput("-500", { allowNegative: true })).toEqual(ok(-50000n));
    expect(parseAmountInput("-₹500.25", { allowNegative: true })).toEqual(ok(-50025n));
    expect(parseAmountInput("₹-500.25", { allowNegative: true })).toEqual(ok(-50025n));
    expect(parseAmountInput("-0", { allowNegative: true })).toEqual(ok(0n));
  });

  it("enforces the ±₹9,99,99,99,999.99 range", () => {
    expect(MAX_AMOUNT_MINOR).toBe(999_999_999_999n);
    expect(parseAmountInput("9,99,99,99,999.99")).toEqual(ok(999_999_999_999n));
    expect(parseAmountInput("-9,99,99,99,999.99", { allowNegative: true })).toEqual(ok(-999_999_999_999n));
    expect(parseAmountInput("10,00,00,00,000.00")).toEqual(err("OUT_OF_RANGE"));
    expect(parseAmountInput("99999999999999999999")).toEqual(err("OUT_OF_RANGE"));
  });

  it("refuses text that is not an amount", () => {
    for (const bad of ["", "   ", "abc", "1.2.3", "1.", ".5x", "₹", "-", "1e5", "0x10", "١٢"]) {
      expect(parseAmountInput(bad, { allowNegative: true })).toEqual(err("NOT_A_NUMBER"));
    }
  });

  it("follows the currency's minor units", () => {
    expect(parseAmountInput("1500", { currency: "JPY" })).toEqual(ok(1500n));
    expect(parseAmountInput("1500.5", { currency: "JPY" })).toEqual(err("TOO_MANY_DECIMALS"));
    expect(parseAmountInput("$12.34", { currency: "USD" })).toEqual(ok(1234n));
  });
});

describe("formatAmountInput", () => {
  it("round-trips through parseAmountInput exactly", async () => {
    const { formatAmountInput } = await import("../src/money/parse");
    for (const v of [0n, 5n, 99n, 5234050n, -50025n, 999_999_999_999n, -999_999_999_999n]) {
      expect(parseAmountInput(formatAmountInput(v), { allowNegative: true })).toEqual({ ok: true, minor: v });
    }
    expect(formatAmountInput(-50025n)).toBe("-500.25");
    expect(formatAmountInput(5n)).toBe("0.05");
    expect(formatAmountInput(1500n, "JPY")).toBe("1500");
  });
});
