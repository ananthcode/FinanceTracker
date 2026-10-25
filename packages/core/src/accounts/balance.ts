/**
 * Current balance (FR-012, FR-013, research R2-07). Balances are never stored; they are derived
 * from the opening balance plus movements on or after the opening date. Mirrored in SQL by
 * app.account_balance_minor() and checked against the same vectors.
 */
import type { AccountType } from "./types";

/**
 * A movement of money on an account, in the account's own sign convention: for owed types
 * (credit cards) positive increases what is owed; for other types positive increases what is held.
 * Movements arrive with transactions in R4.
 */
export interface Movement {
  accountId: string;
  /** Calendar date `yyyy-MM-dd` (Principle XII). */
  date: string;
  amountMinor: bigint;
}

export interface BalanceInput {
  id: string;
  openingBalanceMinor: bigint;
  openingBalanceDate: string;
}

export function currentBalance(account: BalanceInput, movements: readonly Movement[] = []): bigint {
  let balance = account.openingBalanceMinor;
  for (const m of movements) {
    // ISO dates compare correctly as text.
    if (m.accountId === account.id && m.date >= account.openingBalanceDate) balance += m.amountMinor;
  }
  return balance;
}

export interface AvailableCredit {
  /** What can still be spent: limit − owed, never below zero. */
  available: bigint;
  overLimit: boolean;
  /** How far over the limit (0 when not over). */
  overBy: bigint;
}

/** FR-006: only for credit cards with a limit; `balance` is the amount owed. */
export function availableCredit(
  account: { type: AccountType; creditLimitMinor: bigint | null },
  balance: bigint,
): AvailableCredit | null {
  if (account.type !== "credit_card" || account.creditLimitMinor === null) return null;
  const remaining = account.creditLimitMinor - balance;
  return remaining >= 0n
    ? { available: remaining, overLimit: false, overBy: 0n }
    : { available: 0n, overLimit: true, overBy: -remaining };
}
