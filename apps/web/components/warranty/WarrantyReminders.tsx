"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { changes, useSyncPush } from "@/lib/sync-client";

export interface DueReminder {
  id: string;
  item: string;
  daysLeft: number;
  reminder: 1 | 2;
}

const left = (days: number) => (days === 0 ? "ends today" : `ends in ${days} ${days === 1 ? "day" : "days"}`);

/**
 * Warranty reminders on the Dashboard (R9 US2 3, clarify Q3): each names the item and the days left.
 * "Got it" hides it until the next reminder, on every device (it is saved with the transaction).
 */
export function WarrantyReminders({ due }: { due: DueReminder[] }) {
  const push = useSyncPush();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const shown = due.filter((d) => !hidden.has(d.id));
  if (shown.length === 0 && !problem) return null;

  async function gotIt(d: DueReminder) {
    setHidden((h) => new Set(h).add(d.id));
    const outcome = await push([changes.dismissWarrantyReminder(d.id, d.reminder)]);
    if (!outcome.ok || outcome.results[0]?.status === "rejected") {
      setHidden((h) => {
        const next = new Set(h);
        next.delete(d.id);
        return next;
      });
      setProblem("The reminder could not be dismissed. Please try again.");
    }
  }

  return (
    <section id="warranty-reminders" aria-labelledby="warranty-reminders-title" className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <h2 id="warranty-reminders-title" className="text-lg font-semibold">
        Warranties ending soon
      </h2>
      <ul className="flex flex-col gap-2">
        {shown.map((d) => (
          <li key={d.id} data-reminder={d.id} className="flex flex-wrap items-center gap-2">
            <span className="flex-1">
              <Link href={`/transactions/${d.id}?returnTo=%2F`} className="font-medium text-brand-strong hover:underline dark:text-brand">
                {d.item}
              </Link>{" "}
              — warranty {left(d.daysLeft)}.
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => void gotIt(d)}>
              Got it<span className="sr-only"> for {d.item}</span>
            </Button>
          </li>
        ))}
      </ul>
      <Link href="/warranties" className="text-sm text-brand-strong underline dark:text-brand">
        All warranties
      </Link>
      {problem && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {problem}
        </p>
      )}
    </section>
  );
}
