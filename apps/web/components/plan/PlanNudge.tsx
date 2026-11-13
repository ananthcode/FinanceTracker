"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { isNudgeSnoozed, isPlanChecked, monthName, nudgeFor, planCheckMonth, todayInZone, type Month } from "@ft/core";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";

const SNOOZE_KEY = "ft.planNudge.snoozedUntil";
const noSubscription = () => () => {};

function readSnooze(): string | null {
  try {
    return window.localStorage.getItem(SNOOZE_KEY);
  } catch {
    return null; // storage unavailable (private mode): never snoozed
  }
}

function tomorrow(today: string): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Today in the user's timezone, known only in the browser (null while rendering on the server). */
function useToday(timezone: string): string | null {
  return useSyncExternalStore(
    noSubscription,
    () => todayInZone(timezone),
    () => null,
  );
}

async function markChecked(month: Month): Promise<boolean> {
  const res = await apiFetch("/api/me/preferences", { method: "PATCH", body: { planCheckedMonth: month } });
  return res.ok;
}

/**
 * The month-check nudge (FR-023, clarify Q3–Q4): from the 25th to the 5th, "Check your plan for
 * <month>" with how many amounts are still estimated. It stops only when the user selects "Plan
 * checked" for that month (synced to every device); "Not now" hides it until tomorrow on this
 * browser; the Settings switch turns it off. In-app only: no phone or email notification.
 */
export function PlanNudge({
  planNudge,
  planCheckedMonth,
  timezone,
  estimated,
}: {
  planNudge: boolean;
  planCheckedMonth: Month | null;
  timezone: string;
  /** Amounts still estimated, by month (this month and next). */
  estimated: Record<Month, number>;
}) {
  const router = useRouter();
  const today = useToday(timezone);
  const [snoozedNow, setSnoozedNow] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!today) return null;
  const month = nudgeFor(today, { planNudge, planCheckedMonth });
  if (!month || isNudgeSnoozed(today, snoozedNow ?? readSnooze())) return null;
  const count = estimated[month];

  function notNow() {
    const until = tomorrow(today!);
    try {
      window.localStorage.setItem(SNOOZE_KEY, until);
    } catch {
      // hidden for this page view only
    }
    setSnoozedNow(until);
  }

  async function checked() {
    setBusy(true);
    const ok = await markChecked(month!);
    setBusy(false);
    if (!ok) return setError("That could not be saved. Please try again.");
    router.refresh();
  }

  return (
    <section id="plan-nudge" aria-label="Plan reminder" className="flex flex-col gap-2 rounded-lg border border-brand/50 bg-brand/5 p-4">
      <p className="font-medium">Check your plan for {monthName(month)}</p>
      <p className="text-sm">
        {count === undefined
          ? "Look over what is planned, and set the amounts that vary."
          : count === 0
            ? "No amounts are estimated. Look it over and confirm it is right."
            : count === 1
              ? "1 amount is still estimated. Set it, or confirm the estimate is fine."
              : `${count} amounts are still estimated. Set them, or confirm the estimates are fine.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/payment-plan?month=${month.slice(0, 7)}`} className={buttonVariants({ size: "sm" })}>
          Open {monthName(month)}
        </Link>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void checked()}>
          Plan checked
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={notNow}>
          Not now
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * "Plan checked" on the month's own view (FR-023): offered only for the month the nudge is about —
 * this month from the 1st to the 5th, otherwise next month — so a later month can never be checked
 * over an unchecked one.
 */
export function PlanCheckedButton({ month, planCheckedMonth, timezone }: { month: Month; planCheckedMonth: Month | null; timezone: string }) {
  const router = useRouter();
  const today = useToday(timezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!today || planCheckMonth(today) !== month) return null;
  if (isPlanChecked(month, planCheckedMonth)) {
    return (
      <p id="plan-checked" className="text-sm text-muted-foreground">
        Plan checked for {monthName(month)}.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const ok = await markChecked(month);
          setBusy(false);
          if (!ok) return setError("That could not be saved. Please try again.");
          router.refresh();
        }}
      >
        Plan checked<span className="sr-only"> for {monthName(month)}</span>
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
