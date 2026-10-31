"use client";

import Link from "next/link";
import { transactionLabel, type TransactionView } from "@ft/core";
import { DateText } from "@/components/DateText";
import { Money } from "@/components/Money";
import { PersonBalance } from "@/components/lists/PersonBalance";
import type { TransactionNames } from "@/lib/transactions";

export interface PersonMovementRow {
  tx: TransactionView;
  /** The person's balance after this movement (counted ones only move it). */
  balanceAfter: bigint;
  counted: boolean;
}

/**
 * A person's movements, newest first, each with the balance after it in words (R4 FR-008, FR-011,
 * FR-016). Upcoming and awaiting-confirmation entries say so and do not move the balance.
 */
export function PersonMovements({
  rows,
  names,
  todayIso,
  returnTo,
}: {
  rows: PersonMovementRow[];
  names: TransactionNames;
  todayIso: string;
  returnTo: string;
}) {
  return (
    <ul aria-label="Movements" className="flex flex-col divide-y divide-border">
      {rows.map(({ tx, balanceAfter, counted }) => {
        const label = transactionLabel(tx, { account: (id) => names.accounts[id] ?? "an account", payee: (id) => names.payees[id] ?? "" });
        const pending = !tx.confirmed ? (tx.date > todayIso ? "Upcoming" : "To confirm") : tx.status === "void" ? "Void" : null;
        return (
          <li key={tx.id} className="flex flex-col gap-0.5 py-2" data-transaction-id={tx.id}>
            <div className="flex items-baseline gap-3">
              <Link
                href={`/transactions/${tx.id}?returnTo=${encodeURIComponent(returnTo)}`}
                className={`font-medium text-brand-strong hover:underline dark:text-brand ${tx.status === "void" ? "line-through" : ""}`}
              >
                {tx.kind === "person" || tx.kind === "interest" ? label : `${label} (share)`}
              </Link>
              {pending && <span className="rounded-full border border-border px-2 text-xs font-medium">{pending}</span>}
              <Money value={tx.amountMinor} className="ml-auto font-medium tabular-nums" />
            </div>
            <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
              <DateText date={tx.date} />
              {tx.accountId && <span>· {names.accounts[tx.accountId]}</span>}
              {tx.notes && <span className="truncate">· {tx.notes}</span>}
              {counted && (
                <span className="ml-auto">
                  after this: <PersonBalance balance={balanceAfter} />
                </span>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
