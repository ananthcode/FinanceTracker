/**
 * The amount pad's calculator (docs/ANDROID-HOME.md step 2): `120+45`, `1200/3`, `99.5*2`.
 * Works in exact minor units (paise) with bigint, × and ÷ before + and −, each result rounded half
 * away from zero to the paisa. Returns null for an incomplete or invalid expression.
 */
export const OPERATORS = ["+", "−", "×", "÷"] as const;
export type Operator = (typeof OPERATORS)[number];

const SCALE = 100n;

function roundDiv(n: bigint, d: bigint): bigint {
  const negative = n < 0n !== d < 0n;
  const a = n < 0n ? -n : n;
  const b = d < 0n ? -d : d;
  const q = (a * 2n + b) / (b * 2n);
  return negative ? -q : q;
}

function parseNumber(s: string): bigint | null {
  if (!/^\d{1,12}(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole!) * SCALE + BigInt(frac.padEnd(2, "0"));
}

/** Splits "120+45.5" into ["120", "+", "45.5"]. */
export function tokens(expr: string): string[] {
  return expr.split(/([+−×÷])/).filter((t) => t !== "");
}

export function evaluateAmount(expr: string): bigint | null {
  const parts = tokens(expr);
  if (parts.length === 0 || parts.length % 2 === 0) return null;
  const numbers: bigint[] = [];
  const ops: Operator[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      const n = parseNumber(parts[i]!);
      if (n === null) return null;
      numbers.push(n);
    } else {
      if (!(OPERATORS as readonly string[]).includes(parts[i]!)) return null;
      ops.push(parts[i] as Operator);
    }
  }
  // × and ÷ first.
  const terms: bigint[] = [numbers[0]!];
  const addOps: Operator[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const next = numbers[i + 1]!;
    if (op === "×") terms[terms.length - 1] = roundDiv(terms[terms.length - 1]! * next, SCALE);
    else if (op === "÷") {
      if (next === 0n) return null;
      terms[terms.length - 1] = roundDiv(terms[terms.length - 1]! * SCALE, next);
    } else {
      addOps.push(op);
      terms.push(next);
    }
  }
  let total = terms[0]!;
  addOps.forEach((op, i) => {
    total = op === "+" ? total + terms[i + 1]! : total - terms[i + 1]!;
  });
  return total;
}

/** The text after a key press, or the same text when the key is not allowed there. */
export function pressKey(expr: string, key: string): string {
  if (key === "back") return expr.slice(0, -1);
  const last = expr.slice(-1);
  const isOp = (c: string) => (OPERATORS as readonly string[]).includes(c);
  if (isOp(key)) {
    if (expr === "") return expr;
    return isOp(last) ? expr.slice(0, -1) + key : expr + key;
  }
  const current = tokens(expr).pop() ?? "";
  const inNumber = current !== "" && !isOp(current);
  if (key === ".") {
    if (inNumber && current.includes(".")) return expr;
    return expr + (inNumber ? "." : "0.");
  }
  if (inNumber && /\.\d{2}$/.test(current)) return expr;
  if (inNumber && current.replace(".", "").length >= 12) return expr;
  if (current === "0") return expr.slice(0, -1) + key;
  return expr + key;
}
