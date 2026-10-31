"use client";

import { useState, useTransition } from "react";
import type { TransactionView } from "@ft/core";
import type { TransactionCursor, TransactionFilters } from "@ft/db";
import { loadMoreTransactions } from "@/app/(app)/transactions/actions";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import type { TransactionNames } from "@/lib/transactions";
import { TransactionRow } from "./TransactionRow";

/**
 * Transactions newest first with "Load more" (FR-017): the first page comes from the server; later
 * pages from the keyset action. Shows how many match and their net total in words.
 */
export function TransactionList({
  initial,
  filters,
  names,
  todayIso,
  returnTo,
  showSummary = true,
  label = "Transactions",
}: {
  initial: { rows: TransactionView[]; count: number; totalMinor: bigint; next: TransactionCursor | null };
  filters: TransactionFilters;
  names: TransactionNames;
  todayIso: string;
  returnTo: string;
  showSummary?: boolean;
  label?: string;
}) {
  const [rows, setRows] = useState(initial.rows);
  const [next, setNext] = useState(initial.next);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  // A new first page (after a save or a filter change) replaces what was loaded.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setRows(initial.rows);
    setNext(initial.next);
  }

  function loadMore() {
    if (!next) return;
    setFailed(false);
    startLoading(async () => {
      const page = await loadMoreTransactions(filters, next).catch(() => null);
      if (!page) return setFailed(true);
      setRows((r) => [...r, ...page.rows.filter((x) => !r.some((y) => y.id === x.id))]);
      setNext(page.next);
    });
  }

  const total = initial.totalMinor;
  return (
    <div className="flex flex-col gap-3">
      {showSummary && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {initial.count === 1 ? "1 transaction" : `${initial.count.toLocaleString("en-IN")} transactions`}
          {initial.count > 0 && (
            <>
              {" "}
              · net <Money value={total < 0n ? -total : total} className="font-medium text-foreground" />{" "}
              {total < 0n ? "out" : "in"}
            </>
          )}
        </p>
      )}
      {rows.length > 0 && (
        <ul aria-label={label} className="flex flex-col divide-y divide-border">
          {rows.map((tx) => (
            <li key={tx.id}>
              <TransactionRow tx={tx} names={names} todayIso={todayIso} returnTo={returnTo} />
            </li>
          ))}
        </ul>
      )}
      {failed && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          More transactions could not be loaded. Please try again.
        </p>
      )}
      {next && (
        <Button type="button" variant="outline" className="self-start" disabled={loading} onClick={loadMore}>
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
