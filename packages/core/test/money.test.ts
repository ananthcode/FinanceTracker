import { describe, expect, it } from "vitest";
import { formatMoney, maskMoney, MASK } from "../src/money/format";

const indian = { numberFormat: "indian" as const };
const intl = { numberFormat: "international" as const };

describe("formatMoney — Indian grouping (default)", () => {
  it("formats zero", () => {
    expect(formatMoney(0n, "INR", indian)).toBe("₹0.00");
  });

  it("formats paise below one rupee", () => {
    expect(formatMoney(5n, "INR", indian)).toBe("₹0.05");
    expect(formatMoney(99n, "INR", indian)).toBe("₹0.99");
  });

  it("groups lakh and crore", () => {
    expect(formatMoney(123456700n, "INR", indian)).toBe("₹12,34,567.00");
    expect(formatMoney(1234567890n, "INR", indian)).toBe("₹1,23,45,678.90");
    expect(formatMoney(100000n, "INR", indian)).toBe("₹1,000.00");
    expect(formatMoney(10000000n, "INR", indian)).toBe("₹1,00,000.00");
  });

  it("formats negatives with a leading minus sign", () => {
    expect(formatMoney(-123456700n, "INR", indian)).toBe("-₹12,34,567.00");
    expect(formatMoney(-1n, "INR", indian)).toBe("-₹0.01");
  });

  it("handles very large amounts exactly (beyond Number.MAX_SAFE_INTEGER)", () => {
    // whole rupees = 1234567890123456789 → last 3 digits, then pairs
    expect(formatMoney(123456789012345678901n, "INR", indian)).toBe(
      "₹12,34,56,78,90,12,34,56,789.01",
    );
  });
});

describe("formatMoney — international grouping", () => {
  it("groups by thousands", () => {
    expect(formatMoney(123456700n, "INR", intl)).toBe("₹1,234,567.00");
    expect(formatMoney(-100000n, "INR", intl)).toBe("-₹1,000.00");
  });
});

describe("formatMoney — currency minor units and symbols", () => {
  it("uses symbols for common currencies and the code otherwise", () => {
    expect(formatMoney(150n, "USD", intl)).toBe("$1.50");
    expect(formatMoney(150n, "CHF", intl)).toBe("CHF 1.50");
  });

  it("respects zero- and three-decimal currencies", () => {
    expect(formatMoney(1500n, "JPY", intl)).toBe("¥1,500");
    expect(formatMoney(1500n, "KWD", intl)).toBe("KWD 1.500");
  });

  it("rejects non-ISO currency codes", () => {
    expect(() => formatMoney(1n, "rupees", indian)).toThrow();
  });
});

describe("maskMoney", () => {
  it("always returns the same fixed mask regardless of value", () => {
    expect(maskMoney("INR")).toBe(`₹${MASK}`);
    expect(maskMoney("INR")).toBe(maskMoney("INR"));
    expect(maskMoney("USD")).toBe(`$${MASK}`);
  });

  it("does not reveal digit count", () => {
    expect(maskMoney("INR").length).toBe(`₹${MASK}`.length);
  });
});
