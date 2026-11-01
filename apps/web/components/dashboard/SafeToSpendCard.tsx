"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { formatAmountInput, parseAmountInput, type SafeToSpend } from "@ft/core";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api/client";

/**
 * Safe to spend (R6 FR-002, FR-003; clarify Q1): the result and its four parts in words, and the
 * buffer, which can be changed here (also in Settings).
 */
export function SafeToSpendCard({ safe, currency }: { safe: SafeToSpend; currency: string }) {
  const ids = useId();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState(formatAmountInput(safe.bufferMinor, currency));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = buffer.trim() === "" ? ({ ok: true, minor: 0n } as const) : parseAmountInput(buffer, { currency });
    if (!parsed.ok || parsed.minor < 0n) return setError("Enter an amount like 5,000.00.");
    setBusy(true);
    const res = await apiFetch("/api/me/preferences", { method: "PATCH", body: { bufferMinor: parsed.minor.toString() } });
    setBusy(false);
    if (!res.ok) return setError(res.error?.message ?? "The buffer could not be saved.");
    setError(null);
    setEditing(false);
    router.refresh();
  }

  return (
    <section aria-labelledby={`${ids}-title`} className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <h2 id={`${ids}-title`} className="text-sm font-medium text-muted-foreground">
        Safe to spend
      </h2>
      <p id="figure-safe" className="text-2xl font-semibold">
        <Money value={safe.resultMinor} currency={currency} />
      </p>
      {safe.shortfallMinor > 0n && (
        <p className="text-sm text-red-700 dark:text-red-300">
          Short by <Money value={safe.shortfallMinor} currency={currency} /> this month.
        </p>
      )}
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 text-sm">
        <dt className="text-muted-foreground">In bank, cash and wallets</dt>
        <dd className="text-right tabular-nums">
          <Money value={safe.heldMinor} currency={currency} />
        </dd>
        <dt className="text-muted-foreground">Less owed on cards</dt>
        <dd className="text-right tabular-nums">
          <Money value={safe.cardOwedMinor} currency={currency} />
        </dd>
        <dt className="text-muted-foreground">Less still to pay this month</dt>
        <dd className="text-right tabular-nums">
          <Money value={safe.upcomingMinor} currency={currency} />
        </dd>
        <dt className="text-muted-foreground">Less your buffer</dt>
        <dd className="text-right tabular-nums">
          <Money value={safe.bufferMinor} currency={currency} />
        </dd>
      </dl>
      {editing ? (
        <form onSubmit={save} noValidate className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-buffer`}>Buffer to keep</Label>
            <Input id={`${ids}-buffer`} inputMode="decimal" value={buffer} onChange={(e) => setBuffer(e.target.value)} className="w-40" />
          </div>
          <Button type="submit" size="sm" disabled={busy}>
            Save buffer
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          {error && (
            <p role="alert" className="w-full text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
        </form>
      ) : (
        <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setEditing(true)}>
          Change buffer
        </Button>
      )}
    </section>
  );
}
