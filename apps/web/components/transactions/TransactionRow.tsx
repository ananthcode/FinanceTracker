"use client";

import Link from "next/link";
import { TRANSACTION_STATUS_TEXT, transactionLabel, type TransactionView } from "@ft/core";
import { DateText } from "@/components/DateText";
import { Money } from "@/components/Money";
import type { TransactionNames } from "@/lib/transactions";

/** Where the transaction's money went in words: category path, "Split (n)" or "Uncategorised" (contracts/client-transactions.md). */
function categoryText(tx: TransactionView, names: TransactionNames): string | null {
  if (tx.kind !== "expense" && tx.kind !== "income" && tx.kind !== "refund") return null;
  if (tx.lines.length > 0) return `Split (${tx.lines.length})`;
  return tx.categoryId ? (names.categories[tx.categoryId] ?? "Category") : "Uncategorised";
}

/**
 * One transaction in a list (FR-017): what happened in words, the date, account, category, tags and
 * status. Upcoming and awaiting-confirmation entries say so; Void ones are struck through and say
 * "Void" (never colour alone). The amount goes through <Money> (hide-balances, FR-024).
 */
export function TransactionRow({
  tx,
  names,
  todayIso,
  returnTo,
}: {
  tx: TransactionView;
  names: TransactionNames;
  todayIso: string;
  returnTo: string;
}) {
  const label = transactionLabel(tx, {
    account: (id) => names.accounts[id] ?? "an account",
    payee: (id) => names.payees[id] ?? "",
  });
  const isVoid = tx.status === "void";
  const category = categoryText(tx, names);
  const pending = !tx.confirmed ? (tx.date > todayIso ? "Upcoming" : "To confirm") : null;
  const account = tx.kind === "transfer" ? null : tx.accountId ? names.accounts[tx.accountId] : null;

  return (
    <div className="flex flex-col gap-0.5 py-2" data-transaction-id={tx.id}>
      <div className="flex items-baseline gap-3">
        <Link
          href={`/transactions/${tx.id}?returnTo=${encodeURIComponent(returnTo)}`}
          className={`font-medium text-brand-strong hover:underline dark:text-brand ${isVoid ? "line-through" : ""}`}
        >
          {label}
        </Link>
        {pending && (
          <span className="rounded-full border border-border px-2 text-xs font-medium">{pending}</span>
        )}
        <Money value={tx.amountMinor} className={`ml-auto font-medium tabular-nums ${isVoid ? "line-through" : ""}`} />
      </div>
      <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
        <DateText date={tx.date} />
        {tx.timeOfDay && <span>{tx.timeOfDay}</span>}
        {account && <span>· {account}</span>}
        {category && <span>· {category}</span>}
        {tx.tagIds.length > 0 && <span>· {tx.tagIds.map((id) => `#${names.tags[id] ?? "tag"}`).join(" ")}</span>}
        {tx.status !== "uncleared" && <span>· {TRANSACTION_STATUS_TEXT[tx.status]}</span>}
        {tx.notes && <span className="truncate">· {tx.notes}</span>}
      </p>
    </div>
  );
}
