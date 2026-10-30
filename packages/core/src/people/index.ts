/**
 * Person ledgers (R3 FR-016 – FR-019, research R3-07). A person's balance is positive when they owe
 * the user and negative when the user owes them. Exact bigint paise, never stored: always
 * recomputable from the opening balance and (from R4) the movements. app.person_balance_minor is
 * the SQL twin (vectors/people.json).
 */

/** One person-ledger movement on or after the opening date, signed like the balance (R4). */
export interface PersonMovement {
  amountMinor: bigint;
}

export function personBalance(person: { openingBalanceMinor: bigint }, movements: readonly PersonMovement[] = []): bigint {
  return movements.reduce((sum, m) => sum + m.amountMinor, person.openingBalanceMinor);
}

export type PersonLabel = "owes_you" | "you_owe" | "settled";

export function personLabel(balance: bigint): PersonLabel {
  return balance > 0n ? "owes_you" : balance < 0n ? "you_owe" : "settled";
}

/** The words shown with every person balance (FR-018) — never sign or colour alone. */
export const PERSON_LABEL_TEXT: Record<PersonLabel, string> = {
  owes_you: "owes you",
  you_owe: "you owe",
  settled: "settled",
};

export interface PeopleTotals {
  /** Sum of balances people owe the user. */
  owedToYou: bigint;
  /** Sum of what the user owes people, as a positive amount. */
  youOwe: bigint;
}

/** "People owe you" and "You owe people" over every person, hidden ones included (FR-019). */
export function peopleTotals(
  payees: readonly { kind: "business" | "person"; openingBalanceMinor: bigint }[],
  balanceOf: (p: { openingBalanceMinor: bigint }) => bigint = personBalance,
): PeopleTotals {
  let owedToYou = 0n;
  let youOwe = 0n;
  for (const p of payees) {
    if (p.kind !== "person") continue;
    const balance = balanceOf(p);
    if (balance > 0n) owedToYou += balance;
    else youOwe -= balance;
  }
  return { owedToYou, youOwe };
}
