/** Balance labels so meaning never relies on colour alone (FR-015, Principle XIII). */
import { isOwedType, type AccountType } from "./types";

export type BalanceLabel = "owed" | "in_credit" | "overdrawn";

export function balanceLabel(type: AccountType, balance: bigint): BalanceLabel | null {
  if (balance === 0n) return null;
  if (isOwedType(type)) return balance > 0n ? "owed" : "in_credit";
  return balance < 0n ? "overdrawn" : null;
}

/** Words shown next to an amount. */
export const BALANCE_LABEL_TEXT: Record<BalanceLabel, string> = {
  owed: "owed",
  in_credit: "in credit",
  overdrawn: "overdrawn",
};
