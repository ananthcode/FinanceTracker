"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { monthName, type Month } from "@ft/core";
import { linkCandidates, type LinkCandidate } from "@/app/(app)/payment-plan/actions";
import { DateText } from "@/components/DateText";
import { Dialog } from "@/components/Dialog";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changes, useSyncPush } from "@/lib/sync-client";

/**
 * "Link existing" (R7 US3 2, 3; FR-011): likely payments first, then a search of any transaction.
 * Linking adds that transaction's amount to what is paid; nothing new is recorded. A transaction that
 * already pays another item-month is shown but cannot be chosen (a transaction pays at most one).
 */
export function LinkDialog({ itemId, name, month, currency, onClose }: { itemId: string; name: string; month: Month; currency: string; onClose: () => void }) {
  const ids = useId();
  const router = useRouter();
  const push = useSyncPush();
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState("");
  const [list, setList] = useState<LinkCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    void linkCandidates({ itemId, month, ...(asked ? { query: asked } : {}) }).then((found) => {
      if (current) setList(found);
    });
    return () => {
      current = false;
    };
  }, [itemId, month, asked]);

  async function link(c: LinkCandidate) {
    setBusy(true);
    const outcome = await push([changes.linkTransaction({ id: c.id, planItemId: null }, itemId, month)]);
    setBusy(false);
    if (!outcome.ok) return setError(outcome.error.message);
    if (outcome.results[0]?.status === "rejected") return setError("That transaction can't pay this planned payment.");
    router.refresh();
    onClose();
  }

  return (
    <Dialog title={`Link a payment to ${name}`} description={`Choose the transaction that paid ${name} for ${monthName(month)}. Nothing new is recorded.`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setList(null);
          setAsked(query.trim());
        }}
        className="mb-3 flex items-end gap-2"
      >
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={`${ids}-q`}>Search transactions</Label>
          <Input id={`${ids}-q`} value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} placeholder="Payee, notes or reference" />
        </div>
        <Button type="submit" size="sm" variant="outline">
          Search
        </Button>
      </form>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {list === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          Looking…
        </p>
      ) : list.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          {asked ? "No transaction matches." : "No likely payment found. Search for the transaction."}
        </p>
      ) : (
        <ul aria-label="Transactions to link" className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {list.map((c) => (
            <li key={c.id} data-link-candidate={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2">
              <div className="text-sm">
                <p className="font-medium">
                  <Money value={BigInt(c.amountMinor)} currency={currency} /> on <DateText date={c.date} />
                </p>
                <p className="text-muted-foreground">
                  {c.label}
                  {c.notes ? ` · ${c.notes}` : ""}
                  {c.likely && " · likely match"}
                </p>
                {c.linked && (
                  <p>
                    Already pays {c.linked.name} ({c.linked.monthLabel}) — unlink it first.
                  </p>
                )}
              </div>
              <Button type="button" size="sm" disabled={busy || c.linked !== null} onClick={() => void link(c)}>
                Link
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}
