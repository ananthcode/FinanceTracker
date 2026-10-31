"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { INTEREST_MODES, type InterestMode, type PayeeView, type PersonRateView } from "@ft/core";
import { DateText } from "@/components/DateText";
import { refusal } from "@/components/lists/messages";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changes, useSyncPush } from "@/lib/sync-client";

const MODE_TEXT: Record<InterestMode, { label: string; hint: string }> = {
  none: { label: "No interest", hint: "" },
  automatic: {
    label: "Automatic",
    hint: "After each month ends, that month's interest waits in To confirm: the rate × the balance on the 1st.",
  },
  manual: { label: "Manual", hint: "Record interest yourself when you agree it." },
};

/** "1.5" → 15000 (percent × 10⁴), exactly; null when it is not 0–10 with up to four decimals. */
export function parseRate(text: string): number | null {
  const m = /^\s*(\d{1,2})(?:\.(\d{1,4}))?\s*%?\s*$/.exec(text);
  if (!m) return null;
  const e4 = Number(m[1]) * 10_000 + Number((m[2] ?? "").padEnd(4, "0"));
  return e4 <= 100_000 ? e4 : null;
}

/** 15000 → "1.5%" */
export function rateText(e4: number): string {
  const whole = Math.trunc(e4 / 10_000);
  const fraction = String(e4 % 10_000).padStart(4, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}%`;
}

/**
 * A person's interest (R4 FR-013 – FR-015, US4): the setting (none / automatic / manual), the monthly
 * rate history, each rate from the 1st of a month, and "Record interest" by hand.
 */
export function PersonInterest({ person, rates }: { person: PayeeView; rates: PersonRateView[] }) {
  const ids = useId();
  const push = useSyncPush();
  const [month, setMonth] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(list: Parameters<typeof push>[0], fallback: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    const outcome = await push(list);
    setBusy(false);
    const problem = refusal(outcome, fallback);
    setError(problem);
    return problem === null;
  }

  async function addRate(e: React.FormEvent) {
    e.preventDefault();
    const e4 = parseRate(rate);
    if (!month) return setError("Choose the month the rate starts.");
    if (e4 === null) return setError("Enter a monthly rate from 0 to 10, with up to four decimals, like 1.5.");
    if (rates.some((r) => r.effectiveMonth === `${month}-01`)) return setError("There is already a rate from that month. Change or remove it.");
    const ok = await run([changes.createPersonRate(crypto.randomUUID(), { payeeId: person.id, effectiveMonth: `${month}-01`, rateE4: e4 })], "The rate could not be added.");
    if (ok) {
      setMonth("");
      setRate("");
    }
  }

  return (
    <section aria-labelledby={`${ids}-title`} className="flex flex-col gap-3 border-t border-border pt-4">
      <h2 id={`${ids}-title`} className="text-lg font-semibold">
        Interest
      </h2>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Interest on this balance</legend>
        <div className="flex flex-wrap gap-4">
          {INTEREST_MODES.map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${ids}-mode`}
                checked={person.interestMode === m}
                disabled={busy}
                onChange={() => void run([changes.updatePayee(person.id, { interestMode: m })], "The setting could not be saved.")}
              />
              {MODE_TEXT[m].label}
            </label>
          ))}
        </div>
        {MODE_TEXT[person.interestMode].hint && <p className="text-sm text-muted-foreground">{MODE_TEXT[person.interestMode].hint}</p>}
      </fieldset>

      {person.interestMode !== "none" && (
        <>
          <h3 className="text-sm font-medium">Monthly rates</h3>
          {rates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rate yet.</p>
          ) : (
            <ul aria-label="Monthly rates" className="flex flex-col divide-y divide-border">
              {rates.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-1.5 text-sm">
                  <span>
                    {rateText(r.rateE4)} a month from <DateText date={r.effectiveMonth} />
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={busy}
                    aria-label={`Remove the rate from ${r.effectiveMonth.slice(0, 7)}`}
                    onClick={() => void run([changes.deletePersonRate(r.id)], "The rate could not be removed.")}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addRate} noValidate className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-month`}>From the month</Label>
              <Input id={`${ids}-month`} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div className="flex w-32 flex-col gap-1.5">
              <Label htmlFor={`${ids}-rate`}>Rate % a month</Label>
              <Input id={`${ids}-rate`} inputMode="decimal" autoComplete="off" placeholder="1.5" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <Button type="submit" variant="outline" disabled={busy}>
              Add rate
            </Button>
          </form>
          <Link
            href={`/transactions/new?type=interest&payee=${person.id}&returnTo=${encodeURIComponent(`/people/${person.id}`)}`}
            className={`${buttonVariants({ variant: "outline", size: "sm" })} self-start`}
          >
            Record interest
          </Link>
        </>
      )}
    </section>
  );
}
