"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Month } from "@ft/core";
import { DateText } from "@/components/DateText";
import { Money } from "@/components/Money";
import { Button, buttonVariants } from "@/components/ui/button";
import { changes, useSyncPush } from "@/lib/sync-client";
import { LinkDialog } from "./LinkDialog";

/**
 * Pay, Link existing and "Looks paid — link?" for an unpaid item-month (R7 US3 1, 2, 7; FR-010, FR-011,
 * FR-013). Pay opens the add-transaction form already filled in; saving it links the payment. Nothing
 * is linked without the user choosing it.
 */
export function PayActions({
  itemId,
  name,
  month,
  returnTo,
  currency,
  likely,
}: {
  itemId: string;
  name: string;
  month: Month;
  returnTo: string;
  currency: string;
  /** An unlinked transaction that likely paid this (one selection links it). */
  likely: { id: string; amountMinor: bigint; date: string } | null;
}) {
  const router = useRouter();
  const push = useSyncPush();
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function linkLikely() {
    if (!likely) return;
    setBusy(true);
    const outcome = await push([changes.linkTransaction({ id: likely.id, planItemId: null }, itemId, month)]);
    setBusy(false);
    if (!outcome.ok || outcome.results[0]?.status === "rejected") return setError("That could not be linked. Refresh and try again.");
    router.refresh();
  }

  return (
    <>
      <Link
        href={`/transactions/new?plan=${itemId}&month=${month.slice(0, 7)}&returnTo=${encodeURIComponent(returnTo)}`}
        className={buttonVariants({ size: "sm" })}
      >
        Pay<span className="sr-only"> {name}</span>
      </Link>
      <Button type="button" size="sm" variant="outline" onClick={() => setLinking(true)}>
        Link existing<span className="sr-only"> payment to {name}</span>
      </Button>
      {likely && (
        <div data-looks-paid className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border bg-muted p-2 text-sm">
          <span>
            Looks paid: <Money value={likely.amountMinor} currency={currency} /> on <DateText date={likely.date} />.
          </span>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void linkLikely()}>
            Looks paid — link?<span className="sr-only"> {name}</span>
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="w-full text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {linking && <LinkDialog itemId={itemId} name={name} month={month} currency={currency} onClose={() => setLinking(false)} />}
    </>
  );
}
