"use client";

import { personLabel, PERSON_LABEL_TEXT } from "@ft/core";
import { Money } from "@/components/Money";

/**
 * A person's balance with its direction in words (R3 FR-018): "owes you ₹15,000.00",
 * "you owe ₹4,500.00" or "settled" — never by sign or colour alone. Masked by hide-balances.
 */
export function PersonBalance({ balance, className }: { balance: bigint; className?: string }) {
  const label = personLabel(balance);
  if (label === "settled") return <span className={className}>{PERSON_LABEL_TEXT.settled}</span>;
  return (
    <span className={className} data-person-balance={label}>
      {PERSON_LABEL_TEXT[label]} <Money value={balance < 0n ? -balance : balance} />
    </span>
  );
}
