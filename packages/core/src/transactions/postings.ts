/**
 * Postings: every money effect of a transaction (R4 research R4-02, R4-03). The SQL trigger
 * app._rebuild_postings derives exactly the same rows; both run vectors/transactions.json.
 *
 * - Account effects use the account's convention: held accounts rise with money in; owed accounts
 *   (credit cards) owe more with money out.
 * - Person effects are positive when the person owes the user more (flow out) and negative when the
 *   user owes them more (flow in).
 * - Category effects: expense lines +, refund lines −, income lines +; a null category is
 *   Uncategorised. Transfers, person movements and interest have no category effect (FR-009).
 */
import { isOwedType, type AccountType } from "../accounts/types";
import type { Movement } from "../accounts/balance";
import type { MoneyFlow, TransactionView } from "./types";

export type Posting =
  | { lineNo: number; type: "account"; accountId: string; effect: bigint }
  | { lineNo: number; type: "person"; personId: string; effect: bigint }
  | { lineNo: number; type: "category"; categoryId: string | null; kind: "expense" | "income"; effect: bigint };

export type PostingInput = Pick<
  TransactionView,
  "kind" | "flow" | "accountId" | "toAccountId" | "amountMinor" | "payeeId" | "categoryId" | "lines"
>;

/** Counted in balances and totals: active, confirmed and not void (FR-002a, FR-020). */
export function isCounted(tx: Pick<TransactionView, "state" | "confirmed" | "status">): boolean {
  return tx.state === "active" && tx.confirmed && tx.status !== "void";
}

function accountEffect(type: AccountType, flow: MoneyFlow, amount: bigint): bigint {
  const intoAccount = flow === "in" ? amount : -amount;
  return isOwedType(type) ? -intoAccount : intoAccount;
}

const personEffect = (flow: MoneyFlow, amount: bigint) => (flow === "out" ? amount : -amount);

export function postingsOf(tx: PostingInput, accountTypeOf: (accountId: string) => AccountType): Posting[] {
  const out: Posting[] = [];
  if (tx.accountId) out.push({ lineNo: 0, type: "account", accountId: tx.accountId, effect: accountEffect(accountTypeOf(tx.accountId), tx.flow, tx.amountMinor) });

  switch (tx.kind) {
    case "transfer":
      if (tx.toAccountId) {
        out.push({ lineNo: 0, type: "account", accountId: tx.toAccountId, effect: accountEffect(accountTypeOf(tx.toAccountId), "in", tx.amountMinor) });
      }
      return out;
    case "person":
    case "interest":
      if (tx.payeeId) out.push({ lineNo: 0, type: "person", personId: tx.payeeId, effect: personEffect(tx.flow, tx.amountMinor) });
      return out;
    default: {
      const kind = tx.kind === "income" ? "income" : "expense";
      // Expenses add to spending, refunds take from it, income adds to income.
      const sign = tx.kind === "refund" ? -1n : 1n;
      if (tx.lines.length === 0) {
        out.push({ lineNo: 0, type: "category", categoryId: tx.categoryId, kind, effect: sign * tx.amountMinor });
        return out;
      }
      tx.lines.forEach((line, i) => {
        if (line.personId) out.push({ lineNo: i + 1, type: "person", personId: line.personId, effect: personEffect(tx.flow, line.amountMinor) });
        else out.push({ lineNo: i + 1, type: "category", categoryId: line.categoryId, kind, effect: sign * line.amountMinor });
      });
      return out;
    }
  }
}

type Counted = PostingInput & Pick<TransactionView, "date" | "state" | "confirmed" | "status">;

/** Account movements of counted transactions, for currentBalance (R2). */
export function movementsOf(transactions: readonly Counted[], accountTypeOf: (accountId: string) => AccountType): Movement[] {
  const movements: Movement[] = [];
  for (const tx of transactions) {
    if (!isCounted(tx)) continue;
    for (const p of postingsOf(tx, accountTypeOf)) {
      if (p.type === "account") movements.push({ accountId: p.accountId, date: tx.date, amountMinor: p.effect });
    }
  }
  return movements;
}

/** A person's movements from counted transactions, for personBalance (R3). */
export function personMovementsOf(
  transactions: readonly Counted[],
  personId: string,
  accountTypeOf: (accountId: string) => AccountType,
): { date: string; amountMinor: bigint }[] {
  const movements: { date: string; amountMinor: bigint }[] = [];
  for (const tx of transactions) {
    if (!isCounted(tx)) continue;
    for (const p of postingsOf(tx, accountTypeOf)) {
      if (p.type === "person" && p.personId === personId) movements.push({ date: tx.date, amountMinor: p.effect });
    }
  }
  return movements;
}
