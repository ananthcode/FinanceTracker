/**
 * Fractional index keys (R2-06): a key strictly between any two keys, so moving an item changes
 * only that item's key — one field to sync and merge.
 *
 * Algorithm adapted from "fractional-indexing" by Rocicorp (MIT License,
 * https://github.com/rocicorp/fractional-indexing), after David Greenspan's "Implementing
 * Fractional Indexing". Keys are base-62 strings ordered byte-wise; the database column holding
 * them MUST use the "C" collation so Postgres orders them the same way.
 */

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ZERO = DIGITS[0]!;
const SMALLEST_INTEGER = `A${ZERO.repeat(26)}`;

/** A key of the right shape: integer part then a fraction without trailing zeros. */
export const ORDER_KEY_PATTERN = /^[A-Za-z][0-9A-Za-z]*$/;

function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`${a} >= ${b}`);
  if (a.slice(-1) === ZERO || (b !== null && b.slice(-1) === ZERO)) throw new Error("trailing zero");
  if (b !== null) {
    // Skip the common prefix.
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0]!) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]!) : DIGITS.length;
  if (digitB - digitA > 1) return DIGITS[Math.round(0.5 * (digitA + digitB))]!;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA]! + midpoint(a.slice(1), null);
}

function integerLength(head: string): number {
  if (head >= "a" && head <= "z") return head.charCodeAt(0) - "a".charCodeAt(0) + 2;
  if (head >= "A" && head <= "Z") return "Z".charCodeAt(0) - head.charCodeAt(0) + 2;
  throw new Error(`invalid order key head: ${head}`);
}

function integerPart(key: string): string {
  const length = integerLength(key[0]!);
  if (length > key.length) throw new Error(`invalid order key: ${key}`);
  return key.slice(0, length);
}

function validate(key: string): void {
  if (!ORDER_KEY_PATTERN.test(key)) throw new Error(`invalid order key: ${key}`);
  if (key === SMALLEST_INTEGER) throw new Error(`invalid order key: ${key}`);
  const int = integerPart(key);
  if (key.slice(int.length).slice(-1) === ZERO) throw new Error(`invalid order key: ${key}`);
}

function increment(x: string): string | null {
  const [head, ...digits] = x.split("") as [string, ...string[]];
  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i--) {
    const d = DIGITS.indexOf(digits[i]!) + 1;
    if (d === DIGITS.length) digits[i] = ZERO;
    else {
      digits[i] = DIGITS[d]!;
      carry = false;
    }
  }
  if (!carry) return head + digits.join("");
  if (head === "Z") return `a${ZERO}`;
  if (head === "z") return null;
  const next = String.fromCharCode(head.charCodeAt(0) + 1);
  if (next > "a") digits.push(ZERO);
  else digits.pop();
  return next + digits.join("");
}

function decrement(x: string): string | null {
  const [head, ...digits] = x.split("") as [string, ...string[]];
  let borrow = true;
  for (let i = digits.length - 1; borrow && i >= 0; i--) {
    const d = DIGITS.indexOf(digits[i]!) - 1;
    if (d === -1) digits[i] = DIGITS.slice(-1);
    else {
      digits[i] = DIGITS[d]!;
      borrow = false;
    }
  }
  if (!borrow) return head + digits.join("");
  if (head === "a") return `Z${DIGITS.slice(-1)}`;
  if (head === "A") return null;
  const next = String.fromCharCode(head.charCodeAt(0) - 1);
  if (next < "Z") digits.push(DIGITS.slice(-1));
  else digits.pop();
  return next + digits.join("");
}

/** A key strictly between `a` and `b` (`null` = open end). Throws if `a >= b`. */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null) validate(a);
  if (b !== null) validate(b);
  if (a !== null && b !== null && a >= b) throw new Error(`${a} >= ${b}`);

  if (a === null) {
    if (b === null) return `a${ZERO}`;
    const ib = integerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) return ib + midpoint("", fb);
    if (ib < b) return ib;
    const res = decrement(ib);
    if (res === null) throw new Error("cannot decrement any more");
    return res;
  }

  if (b === null) {
    const ia = integerPart(a);
    const fa = a.slice(ia.length);
    const i = increment(ia);
    return i === null ? ia + midpoint(fa, null) : i;
  }

  const ia = integerPart(a);
  const fa = a.slice(ia.length);
  const ib = integerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) return ia + midpoint(fa, fb);
  const i = increment(ia);
  if (i === null) throw new Error("cannot increment any more");
  if (i < b) return i;
  return ia + midpoint(fa, null);
}

/** `n` ordered keys between `a` and `b` (used for seeding and tests). */
export function keysBetween(a: string | null, b: string | null, n: number): string[] {
  const keys: string[] = [];
  let last = a;
  for (let i = 0; i < n; i++) {
    last = keyBetween(last, b);
    keys.push(last);
  }
  return keys;
}
