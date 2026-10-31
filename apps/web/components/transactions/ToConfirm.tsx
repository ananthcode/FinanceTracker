"use client";

import { useState } from "react";
import type { TransactionView } from "@ft/core";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { changes, useSyncPush } from "@/lib/sync-client";
import type { TransactionNames } from "@/lib/transactions";
import { TransactionRow } from "./TransactionRow";

/**
 * "To confirm" (FR-002a, FR-014): upcoming transactions whose date has come and interest proposals,
 * oldest first. Each can be confirmed, edited or deleted; several selected can be confirmed at once.
 * Nothing here counts in a balance until it is confirmed.
 */
export function ToConfirm({ rows, names, todayIso }: { rows: TransactionView[]; names: TransactionNames; todayIso: string }) {
  const push = useSyncPush();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TransactionView | null>(null);

  async function run(list: Parameters<typeof push>[0], failure: string) {
    setBusy(true);
    setError(null);
    const outcome = await push(list);
    setBusy(false);
    if (!outcome.ok) return setError(outcome.error.message);
    const refused = outcome.results.filter((r) => r.status === "rejected").length;
    if (refused > 0) setError(refused === list.length ? failure : `${refused} of ${list.length} could not be changed. Open them to check.`);
    setSelected(new Set());
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-labelledby="to-confirm-title" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="to-confirm-title" className="mr-auto text-lg font-semibold">
          To confirm ({rows.length})
        </h2>
        <Button
          type="button"
          size="sm"
          disabled={busy || selected.size === 0}
          onClick={() => void run(changes.confirmTransactions([...selected]), "They could not be confirmed.")}
        >
          Confirm selected{selected.size > 0 ? ` (${selected.size})` : ""}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">These don&rsquo;t count in any balance until you confirm them.</p>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <ul aria-label="Transactions to confirm" className="flex flex-col divide-y divide-border">
        {[...rows].reverse().map((tx) => (
          <li key={tx.id} className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-3"
              aria-label="Select for confirming"
              checked={selected.has(tx.id)}
              onChange={() => toggle(tx.id)}
            />
            <div className="min-w-0 flex-1">
              <TransactionRow tx={tx} names={names} todayIso={todayIso} returnTo="/transactions" />
            </div>
            <div className="flex gap-1 py-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void run(changes.confirmTransactions([tx.id]), "It could not be confirmed. Open it to check.")}
              >
                Confirm
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => setDeleting(tx)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {deleting && (
        <ConfirmDialog
          title="Delete this transaction?"
          confirmLabel="Delete"
          destructive
          busy={busy}
          onConfirm={() => {
            const id = deleting.id;
            setDeleting(null);
            void run([changes.deleteTransaction(id)], "It could not be deleted.");
          }}
          onCancel={() => setDeleting(null)}
        >
          It will not be counted or proposed again.
        </ConfirmDialog>
      )}
    </section>
  );
}
