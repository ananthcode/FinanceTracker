"use client";

import { useState, useTransition } from "react";
import { transactionLabel, type CategoryView, type PayeeView, type TagView, type TransactionView } from "@ft/core";
import type { TransactionCursor, TransactionFilters } from "@ft/db";
import { loadMoreTransactions } from "@/app/(app)/transactions/actions";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import type { TransactionNames } from "@/lib/transactions";
import { BulkBar } from "./BulkBar";
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
  bulk,
}: {
  initial: { rows: TransactionView[]; count: number; totalMinor: bigint; next: TransactionCursor | null };
  filters: TransactionFilters;
  names: TransactionNames;
  todayIso: string;
  returnTo: string;
  showSummary?: boolean;
  label?: string;
  /** Lists for changing selected rows together (FR-018); without it rows cannot be selected. */
  bulk?: { categoryPaths: [string, string][]; categories: CategoryView[]; payees: PayeeView[]; tags: TagView[] };
}) {
  const [rows, setRows] = useState(initial.rows);
  const [next, setNext] = useState(initial.next);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  // A new first page (after a save or a filter change) replaces what was loaded.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setRows(initial.rows);
    setNext(initial.next);
  }
  const toggle = (id: string) =>
    setSelected((s) => {
      const nextSet = new Set(s);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

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
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "" : "text-red-700 dark:text-red-300"}`}>
          {result.text}
        </p>
      )}
      {bulk && rows.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
          />
          Select all shown ({rows.length})
        </label>
      )}
      {rows.length > 0 && (
        <ul aria-label={label} className="flex flex-col divide-y divide-border">
          {rows.map((tx) => (
            <li key={tx.id} className={bulk ? "flex items-start gap-3" : undefined}>
              {bulk && (
                <input
                  type="checkbox"
                  className="mt-3"
                  aria-label={`Select: ${transactionLabel(tx, {
                    account: (id) => names.accounts[id] ?? "an account",
                    payee: (id) => names.payees[id] ?? "",
                  })}, ${tx.date}`}
                  checked={selected.has(tx.id)}
                  onChange={() => toggle(tx.id)}
                />
              )}
              <div className="min-w-0 flex-1">
                <TransactionRow tx={tx} names={names} todayIso={todayIso} returnTo={returnTo} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {bulk && selected.size > 0 && (
        <BulkBar
          selected={rows.filter((r) => selected.has(r.id))}
          categoryPaths={bulk.categoryPaths}
          categories={bulk.categories}
          payees={bulk.payees}
          tags={bulk.tags}
          onDone={(r) => {
            setResult(r);
            setSelected(new Set());
          }}
        />
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
