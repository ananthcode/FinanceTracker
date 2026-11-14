"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { formatAmountInput, monthName, parseAmountInput, type Month } from "@ft/core";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changes, useSyncPush } from "@/lib/sync-client";

export interface RowActionsProps {
  itemId: string;
  name: string;
  month: Month;
  plannedMinor: bigint;
  skipped: boolean;
  /** One-off items cannot be ended or skipped on their own. */
  oneOff: boolean;
  /** The item's end month, when set. */
  endMonth: Month | null;
  currency: string;
  /** Extra actions (Pay, Link existing — US3). */
  children?: React.ReactNode;
}

/**
 * Per-row actions on the plan (R7 US2 2, 5; FR-006): set this month's amount, skip or un-skip the month,
 * end the item after this month. Each is one change; a month's amount uses the item-month's
 * deterministic id, so two devices editing it merge (R7-02).
 */
export function RowActions({ itemId, name, month, plannedMinor, skipped, oneOff, endMonth, currency, children }: RowActionsProps) {
  const ids = useId();
  const router = useRouter();
  const push = useSyncPush();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(formatAmountInput(plannedMinor, currency));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  async function send(change: Parameters<typeof push>[0][number]) {
    setBusy(true);
    const outcome = await push([change]);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error.message);
      return false;
    }
    if (outcome.results[0]?.status === "rejected") {
      setError(outcome.results[0].code === "HAS_PAYMENTS" ? "Later months are already paid, so it can't end here." : "That could not be saved. Refresh and try again.");
      return false;
    }
    setError(null);
    router.refresh();
    return true;
  }

  async function saveAmount(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseAmountInput(amount, { currency });
    if (!parsed.ok || parsed.minor < 0n) return setError("Enter an amount like 2,150.00.");
    if (await send(changes.setPlanMonth(itemId, month, { amountMinor: parsed.minor.toString() }))) setEditing(false);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-1">
        {children}
        {!skipped && (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            Set amount<span className="sr-only"> for {name}, {monthName(month)}</span>
          </Button>
        )}
        {!oneOff && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void send(changes.setPlanMonth(itemId, month, { skipped: !skipped }))}>
            {skipped ? "Undo skip" : "Skip"}
            <span className="sr-only">
              {" "}
              {name}, {monthName(month)}
            </span>
          </Button>
        )}
        {!oneOff && endMonth !== month && (
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirmEnd(true)}>
            End<span className="sr-only"> {name}</span>
          </Button>
        )}
      </div>
      {editing && (
        <form onSubmit={saveAmount} noValidate className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-amount`}>
              Amount for {monthName(month)}
            </Label>
            <Input id={`${ids}-amount`} inputMode="decimal" className="w-36" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={busy}>
            Save amount
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {confirmEnd && (
        <ConfirmDialog
          title={`End ${name} after ${monthName(month)}?`}
          confirmLabel="End it"
          busy={busy}
          onConfirm={() => void send(changes.updatePlanItem(itemId, { endMonth: month })).then(() => setConfirmEnd(false))}
          onCancel={() => setConfirmEnd(false)}
        >
          It stays in the plan up to {monthName(month)} and no longer appears after that. Paid months are kept.
        </ConfirmDialog>
      )}
    </div>
  );
}
