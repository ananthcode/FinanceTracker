/** Shared account vocabulary (data-model.md). Money is always `bigint` minor units. */

export const ACCOUNT_TYPES = ["bank", "cash", "wallet", "credit_card"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Display and subtotal order of the "By type" view (FR-009). */
export const TYPE_ORDER: readonly AccountType[] = ["bank", "cash", "wallet", "credit_card"];

export type AccountState = "active" | "archived" | "deleted";
export type GroupState = "active" | "deleted";
export type AccountsView = "by_type" | "my_groups";

/** An account as the screens read it (packages/db listAccounts). */
export interface AccountView {
  id: string;
  name: string;
  type: AccountType;
  openingBalanceMinor: bigint;
  openingBalanceDate: string;
  currency: string;
  colour: string;
  icon: string;
  sortKey: string;
  groupId: string | null;
  includeInNetWorth: boolean;
  notes: string | null;
  creditLimitMinor: bigint | null;
  state: AccountState;
}

/** A user group as the screens read it. */
export interface GroupView {
  id: string;
  name: string;
  sortKey: string;
  state: GroupState;
}

/** Credit cards hold what is owed; every other type holds what is owned (FR-005). */
export function isOwedType(type: AccountType): boolean {
  return type === "credit_card";
}
