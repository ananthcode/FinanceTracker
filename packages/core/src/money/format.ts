/**
 * Money formatting (constitution II, XII, XIII).
 *
 * Amounts are always integers in the currency's smallest unit (paise for INR) passed as `bigint`.
 * Formatting is pure string/integer arithmetic — no floating point anywhere.
 */

export type NumberFormat = "indian" | "international";

export interface MoneyFormatPrefs {
  numberFormat: NumberFormat;
}

/** Fixed mask used by hide-balances mode; never reveals digit count (FR-032). */
export const MASK = "••••";

/** ISO 4217 minor-unit exponents that differ from the default of 2. */
const MINOR_UNITS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  JOD: 3,
  TND: 3,
};

const SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  AED: "AED ",
};

const CURRENCY_CODE = /^[A-Z]{3}$/;

export function assertCurrency(currency: string): void {
  if (!CURRENCY_CODE.test(currency)) {
    throw new Error(`Invalid ISO 4217 currency code: ${currency}`);
  }
}

export function minorUnitsOf(currency: string): number {
  assertCurrency(currency);
  return MINOR_UNITS[currency] ?? 2;
}

export function currencySymbol(currency: string): string {
  assertCurrency(currency);
  return SYMBOLS[currency] ?? `${currency} `;
}

/** Groups an unsigned digit string: Indian (3 then 2s) or international (3s). */
export function groupDigits(digits: string, format: NumberFormat): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const size = format === "indian" ? 2 : 3;
  const groups: string[] = [];
  for (let end = rest.length; end > 0; end -= size) {
    groups.unshift(rest.slice(Math.max(0, end - size), end));
  }
  return `${groups.join(",")},${last3}`;
}

/** Formats a minor-unit amount, e.g. 123456700n INR → "₹12,34,567.00" (Indian grouping). */
export function formatMoney(minor: bigint, currency: string, prefs: MoneyFormatPrefs): string {
  const exponent = minorUnitsOf(currency);
  const symbol = currencySymbol(currency);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;

  const digits = abs.toString().padStart(exponent + 1, "0");
  const whole = exponent === 0 ? digits : digits.slice(0, -exponent);
  const fraction = exponent === 0 ? "" : `.${digits.slice(-exponent)}`;

  return `${negative ? "-" : ""}${symbol}${groupDigits(whole, prefs.numberFormat)}${fraction}`;
}

/** Hide-balances representation: symbol + fixed mask, independent of the value. */
export function maskMoney(currency: string): string {
  return `${currencySymbol(currency)}${MASK}`;
}
