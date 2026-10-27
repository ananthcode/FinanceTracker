/**
 * Amount entry (R2-11, constitution II "convert at the boundary").
 *
 * Turns what a person types into exact integer minor units. Pure string arithmetic: no floats and
 * no rounding — more decimals than the currency has is refused, never rounded.
 */
import { currencySymbol, minorUnitsOf } from "./format";

/** ±₹9,99,99,99,999.99 (FR-003): the largest magnitude, in minor units. */
export const MAX_AMOUNT_MINOR = 999_999_999_999n;

export type AmountInputError = "NOT_A_NUMBER" | "TOO_MANY_DECIMALS" | "OUT_OF_RANGE" | "NEGATIVE_NOT_ALLOWED";

export type AmountInputResult = { ok: true; minor: bigint } | { ok: false; error: AmountInputError };

export interface AmountInputOptions {
  /** Allow a leading minus (e.g. an overdrawn opening balance). Default false. */
  allowNegative?: boolean;
  /** ISO 4217 code; decides decimals and the accepted symbol. Default INR. */
  currency?: string;
}

const PLAIN = /^\d+$/;
const INTERNATIONAL = /^\d{1,3}(,\d{3})+$/;
const INDIAN = /^\d{1,2}(,\d{2})*,\d{3}$/;

const fail = (error: AmountInputError): AmountInputResult => ({ ok: false, error });

/** Minor units → plain text an amount field can show and parse back exactly, e.g. -50025n → "-500.25". */
export function formatAmountInput(minor: bigint, currency = "INR"): string {
  const exponent = minorUnitsOf(currency);
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString().padStart(exponent + 1, "0");
  const text = exponent === 0 ? digits : `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
  return negative ? `-${text}` : text;
}

export function parseAmountInput(text: string, options: AmountInputOptions = {}): AmountInputResult {
  const currency = options.currency ?? "INR";
  const exponent = minorUnitsOf(currency);
  const symbol = currencySymbol(currency).trim();

  let s = text.replace(/\s+/g, "");
  let negative = false;
  // The sign may come before or after the currency symbol: "-₹500" and "₹-500".
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (s.startsWith(symbol)) s = s.slice(symbol.length);
  if (!negative && s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }

  const [whole, fraction, ...rest] = s.split(".");
  if (whole === undefined || whole === "" || rest.length > 0) return fail("NOT_A_NUMBER");
  if (!PLAIN.test(whole) && !INTERNATIONAL.test(whole) && !INDIAN.test(whole)) return fail("NOT_A_NUMBER");
  if (fraction !== undefined && !PLAIN.test(fraction)) return fail("NOT_A_NUMBER");
  if (fraction !== undefined && fraction.length > exponent) return fail("TOO_MANY_DECIMALS");

  const digits = whole.replaceAll(",", "") + (fraction ?? "").padEnd(exponent, "0");
  // Guard against absurdly long input before BigInt conversion.
  if (digits.replace(/^0+/, "").length > 15) return fail("OUT_OF_RANGE");
  const magnitude = BigInt(digits);
  if (magnitude > MAX_AMOUNT_MINOR) return fail("OUT_OF_RANGE");
  if (negative && magnitude !== 0n && !options.allowNegative) return fail("NEGATIVE_NOT_ALLOWED");
  return { ok: true, minor: negative ? -magnitude : magnitude };
}
