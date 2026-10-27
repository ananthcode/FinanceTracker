/** Balance labels so meaning never relies on colour alone (FR-015, Principle XIII). */
import { isOwedType, type AccountType } from "./types";

export type BalanceLabel = "owed" | "in_credit" | "overdrawn";

export function balanceLabel(type: AccountType, balance: bigint): BalanceLabel | null {
  if (balance === 0n) return null;
  if (isOwedType(type)) return balance > 0n ? "owed" : "in_credit";
  return balance < 0n ? "overdrawn" : null;
}

/** Name of one account type, and the title of its group in the "By type" view (FR-009). */
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  bank: "Bank account",
  cash: "Cash",
  wallet: "Wallet",
  credit_card: "Credit card",
};

export const ACCOUNT_TYPE_GROUP_TITLE: Record<AccountType, string> = {
  bank: "Bank accounts",
  cash: "Cash",
  wallet: "Wallets",
  credit_card: "Credit cards",
};

/** Words shown next to an amount. */
export const BALANCE_LABEL_TEXT: Record<BalanceLabel, string> = {
  owed: "owed",
  in_credit: "in credit",
  overdrawn: "overdrawn",
};
