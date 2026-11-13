import type { PlanTotals as Totals } from "@ft/core";
import { Money } from "@/components/Money";

/**
 * The month's totals (FR-003): planned, paid and still to pay, and overpaid when not zero. Planned =
 * paid + still to pay − overpaid exactly; carried-over months count here only in the current month.
 */
export function PlanTotals({ totals, currency, carriedNote }: { totals: Totals; currency: string; carriedNote?: string }) {
  return (
    <section aria-label="Totals" className="flex flex-col gap-1">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border p-3">
          <dt className="text-sm text-muted-foreground">Planned</dt>
          <dd id="plan-total-planned" className="text-lg font-semibold tabular-nums">
            <Money value={totals.plannedMinor} currency={currency} />
          </dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-sm text-muted-foreground">Paid</dt>
          <dd id="plan-total-paid" className="text-lg font-semibold tabular-nums">
            <Money value={totals.paidMinor} currency={currency} />
          </dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-sm text-muted-foreground">Still to pay</dt>
          <dd id="plan-total-left" className="text-lg font-semibold tabular-nums">
            <Money value={totals.leftMinor} currency={currency} />
          </dd>
        </div>
        {totals.overpaidMinor > 0n && (
          <div className="rounded-lg border border-border p-3">
            <dt className="text-sm text-muted-foreground">Paid more than planned</dt>
            <dd id="plan-total-overpaid" className="text-lg font-semibold tabular-nums">
              <Money value={totals.overpaidMinor} currency={currency} />
            </dd>
          </div>
        )}
      </dl>
      {carriedNote && <p className="text-sm text-muted-foreground">{carriedNote}</p>}
    </section>
  );
}
