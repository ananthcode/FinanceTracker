/**
 * Spending and income per category (R4 FR-009): expense and refund lines make spending (refunds
 * reduce it), income lines make income; transfers, person movements and interest are in neither.
 * Uncounted transactions (upcoming, awaiting confirmation, void, deleted) are left out.
 */
import type { CategoryView } from "../categories/types";
import { isCounted, postingsOf } from "./postings";
import type { TransactionView } from "./types";

/** The key Uncategorised totals are kept under. */
export const UNCATEGORISED = "uncategorised";

export interface CategoryTotal {
  /** Recorded on the category itself. */
  own: bigint;
  /** Its own plus every sub-category's. */
  total: bigint;
}

export interface CategoryTotals {
  expense: Map<string, CategoryTotal>;
  income: Map<string, CategoryTotal>;
  /** Net spending: expenses minus refunds. */
  spending: bigint;
  earning: bigint;
}

/** A person's effect of one transaction: its person postings for them (0 when it does not count). */
export function personEffectOf(tx: Totalled, personId: string): bigint {
  if (!isCounted(tx)) return 0n;
  return postingsOf(tx, () => "bank").reduce((sum, p) => (p.type === "person" && p.personId === personId ? sum + p.effect : sum), 0n);
}

/**
 * The person's balance after each of their transactions, given newest first and the balance now
 * (R4 FR-008): each row's "after" is the current balance less the effects of the newer rows.
 */
export function runningPersonBalances(newestFirst: readonly Totalled[], personId: string, balanceNow: bigint): bigint[] {
  let balance = balanceNow;
  return newestFirst.map((tx) => {
    const after = balance;
    balance -= personEffectOf(tx, personId);
    return after;
  });
}

type Totalled =Pick<TransactionView, "kind" | "flow" | "accountId" | "toAccountId" | "amountMinor" | "payeeId" | "categoryId" | "lines" | "date" | "state" | "confirmed" | "status">;

export function categoryTotals(
  transactions: readonly Totalled[],
  categories: readonly Pick<CategoryView, "id" | "parentId">[],
  range: { from?: string; to?: string } = {},
): CategoryTotals {
  const parents = new Map(categories.map((c) => [c.id, c.parentId]));
  const result: CategoryTotals = { expense: new Map(), income: new Map(), spending: 0n, earning: 0n };
  const add = (map: Map<string, CategoryTotal>, id: string, own: bigint, total: bigint) => {
    const t = map.get(id) ?? { own: 0n, total: 0n };
    map.set(id, { own: t.own + own, total: t.total + total });
  };

  for (const tx of transactions) {
    if (!isCounted(tx)) continue;
    if ((range.from && tx.date < range.from) || (range.to && tx.date > range.to)) continue;
    // Category postings do not depend on the account's type.
    for (const p of postingsOf(tx, () => "bank")) {
      if (p.type !== "category") continue;
      const map = result[p.kind];
      if (p.kind === "expense") result.spending += p.effect;
      else result.earning += p.effect;
      const id = p.categoryId ?? UNCATEGORISED;
      add(map, id, p.effect, p.effect);
      // Roll up into every parent (guarding against a cycle in bad data).
      const seen = new Set([id]);
      for (let parent = parents.get(id); parent && !seen.has(parent); parent = parents.get(parent)) {
        seen.add(parent);
        add(map, parent, 0n, p.effect);
      }
    }
  }
  return result;
}
