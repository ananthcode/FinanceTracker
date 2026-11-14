"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { formatAmountInput, readAmountBox, recordFromTemplate, type TemplateView } from "@ft/core";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Money } from "@/components/Money";
import { useDisplay } from "@/components/providers/DisplayProvider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changes, useSyncPush } from "@/lib/sync-client";

/** What the server worked out for each template: the planned payment it pays now, and what is missing. */
export interface QuickAddInfo {
  /** The item-month a tied template pays now (R8-04), or null. */
  pays: { itemId: string; month: string; name: string } | null;
  /** Words after "Recorded …" about the planned payment, or null when untied. */
  tie: string | null;
  /** Something the template refers to was archived or deleted: Record opens the form (FR-011). */
  incomplete: boolean;
}

const UNDO_MS = 10_000;

/**
 * Quick add (R8 US1, US3): each template with an amount box beside Record (clarify Q4). Record makes an
 * ordinary transaction for today straight from the list, says what it recorded, and offers Undo for 10
 * seconds (FR-008); the same template again within 10 seconds asks first (FR-009). "Edit first" opens
 * the add-transaction form filled in. `limit` shows only the first few (the Dashboard strip).
 */
export function QuickAdd({
  templates,
  info,
  today,
  currency,
  limit,
  returnTo,
}: {
  templates: TemplateView[];
  info: Record<string, QuickAddInfo>;
  today: string;
  currency: string;
  limit?: number;
  returnTo: string;
}) {
  const router = useRouter();
  const push = useSyncPush();
  const { hideBalances } = useDisplay();
  const shown = limit ? templates.slice(0, limit) : templates;
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(templates.map((t) => [t.id, t.amountMinor === null ? "" : formatAmountInput(t.amountMinor, currency)])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ templateId: string; transactionId: string; name: string; amountMinor: bigint; tie: string | null; at: number } | null>(null);
  const [again, setAgain] = useState<TemplateView | null>(null);
  const lastRecorded = useRef<Record<string, number>>({});
  const ids = useId();

  // Undo is offered for 10 seconds (FR-008).
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), Math.max(0, done.at + UNDO_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [done]);

  const editFirst = (t: TemplateView, amountMinor?: bigint) =>
    `/transactions/new?template=${t.id}${amountMinor !== undefined ? `&amount=${amountMinor}` : ""}&returnTo=${encodeURIComponent(returnTo)}`;

  function select(t: TemplateView) {
    const recent = lastRecorded.current[t.id];
    if (recent !== undefined && Date.now() - recent < UNDO_MS) return setAgain(t);
    void record(t);
  }

  async function record(t: TemplateView) {
    setAgain(null);
    const box = readAmountBox(t, amounts[t.id] ?? "", currency);
    if (!box.ok && "openForm" in box) {
      const parsed = readAmountBox({ ...t, lines: [] }, amounts[t.id] ?? "", currency);
      return router.push(editFirst(t, parsed.ok ? parsed.amountMinor : undefined));
    }
    if (!box.ok) return setErrors((e) => ({ ...e, [t.id]: box.message }));
    setErrors((e) => ({ ...e, [t.id]: "" }));
    const meta = info[t.id];
    if (meta?.incomplete) return router.push(editFirst(t, box.amountMinor));

    const transactionId = crypto.randomUUID();
    const fields = recordFromTemplate(t, { amountMinor: box.amountMinor, today, pays: meta?.pays ?? null, newId: () => crypto.randomUUID() });
    setBusy(t.id);
    const outcome = await push([changes.createTransaction(transactionId, fields)]);
    setBusy(null);
    if (!outcome.ok) return setErrors((e) => ({ ...e, [t.id]: outcome.error.code === "NETWORK" ? "You appear to be offline. Please try again." : outcome.error.message }));
    const result = outcome.results[0];
    if (result?.status === "rejected") {
      // Something it refers to changed since the page loaded: let the user check it in the form.
      return router.push(editFirst(t, box.amountMinor));
    }
    lastRecorded.current[t.id] = Date.now();
    setDone({ templateId: t.id, transactionId, name: t.name, amountMinor: box.amountMinor, tie: meta?.tie ?? null, at: Date.now() });
  }

  async function undo() {
    if (!done) return;
    const outcome = await push([changes.deleteTransaction(done.transactionId)]);
    if (!outcome.ok || outcome.results[0]?.status === "rejected") return;
    delete lastRecorded.current[done.templateId];
    setDone(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label="Quick add templates" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((t) => {
          const error = errors[t.id];
          return (
            <li key={t.id} data-template={t.name} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
              <p className="font-medium">{t.name}</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  select(t);
                }}
                noValidate
                className="flex flex-wrap items-center gap-2"
              >
                <label htmlFor={`${ids}-${t.id}`} className="sr-only">
                  Amount for {t.name}
                </label>
                <Input
                  id={`${ids}-${t.id}`}
                  inputMode="decimal"
                  autoComplete="off"
                  className="w-32"
                  placeholder="Enter amount"
                  value={hideBalances && t.amountMinor !== null && amounts[t.id] === formatAmountInput(t.amountMinor, currency) ? "••••" : (amounts[t.id] ?? "")}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setAmounts((a) => ({ ...a, [t.id]: e.target.value }))}
                  aria-invalid={!!error || undefined}
                  aria-describedby={error ? `${ids}-${t.id}-error` : undefined}
                />
                <Button type="submit" size="sm" disabled={busy === t.id}>
                  Record<span className="sr-only"> {t.name}</span>
                </Button>
                <Link href={editFirst(t)} className={buttonVariants({ size: "sm", variant: "outline" })}>
                  Edit first<span className="sr-only"> {t.name}</span>
                </Link>
              </form>
              {error && (
                <p id={`${ids}-${t.id}-error`} className="text-sm text-red-700 dark:text-red-300">
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {done && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted p-2 text-sm">
          <span id="quick-add-done">
            Recorded {done.name}, <Money value={done.amountMinor} currency={currency} />, today{done.tie ? ` · ${done.tie}` : ""}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => void undo()}>
            Undo
          </Button>
        </div>
      )}
      {again && (
        <ConfirmDialog title="Record it again?" confirmLabel="Record again" onConfirm={() => void record(again)} onCancel={() => setAgain(null)}>
          {again.name} was recorded a moment ago. Record it a second time?
        </ConfirmDialog>
      )}
    </div>
  );
}
