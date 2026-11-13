import { monthName, type PlanMonthView } from "@ft/core";
import { Money } from "@/components/Money";

/**
 * Compared with last month (FR-016, US5 1): planned and paid totals for both months and the
 * difference in words, and each item's paid amount last month beside this month's plan. Carried-over
 * months are left out on both sides, so like is compared with like.
 */
export function Comparison({ view, currency }: { view: PlanMonthView; currency: string }) {
  const own = view.rows.filter((r) => r.status !== "skipped");
  const planned = own.reduce((s, r) => s + r.plannedMinor, 0n);
  const paid = own.reduce((s, r) => s + r.paidMinor, 0n);
  const { previous } = view;
  return (
    <section id="plan-compare" aria-labelledby="plan-compare-title" className="flex flex-col gap-2">
      <h2 id="plan-compare-title" className="text-lg font-semibold">
        Compared with {monthName(previous.month)}
      </h2>
      <p id="plan-compare-words">
        {previous.direction === "same" ? (
          <>Planned the same as last month.</>
        ) : (
          <>
            Planned <Money value={previous.differenceMinor} currency={currency} /> {previous.direction} than last month.
          </>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
          <caption className="sr-only">
            Planned and paid in {monthName(view.month)} and {monthName(previous.month)}
          </caption>
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="py-1 pr-3 font-medium">Payment</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">Planned this month</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">Paid this month</th>
              <th scope="col" className="py-1 text-right font-medium">Paid last month</th>
            </tr>
          </thead>
          <tbody>
            {own.map((r) => (
              <tr key={r.itemId} className="border-t border-border" data-compare-row={r.name}>
                <th scope="row" className="py-1 pr-3 font-normal">{r.name}</th>
                <td className="py-1 pr-3 text-right tabular-nums">
                  <Money value={r.plannedMinor} currency={currency} />
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  <Money value={r.paidMinor} currency={currency} />
                </td>
                <td className="py-1 text-right tabular-nums">
                  {r.previousPaidMinor > 0n ? <Money value={r.previousPaidMinor} currency={currency} /> : <span className="text-muted-foreground">Nothing</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-semibold">
              <th scope="row" className="py-1 pr-3">Total</th>
              <td id="plan-compare-planned" className="py-1 pr-3 text-right tabular-nums">
                <Money value={planned} currency={currency} />
              </td>
              <td id="plan-compare-paid" className="py-1 pr-3 text-right tabular-nums">
                <Money value={paid} currency={currency} />
              </td>
              <td id="plan-compare-last-paid" className="py-1 text-right tabular-nums">
                <Money value={previous.paidMinor} currency={currency} />
              </td>
            </tr>
            <tr className="text-muted-foreground">
              <th scope="row" className="py-1 pr-3 font-normal">Planned last month</th>
              <td id="plan-compare-last-planned" className="py-1 pr-3 text-right tabular-nums">
                <Money value={previous.plannedMinor} currency={currency} />
              </td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
