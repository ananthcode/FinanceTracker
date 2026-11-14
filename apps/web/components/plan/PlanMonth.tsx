import Link from "next/link";
import { addMonths, monthName, type Month, type PlanItem, type PlanMonthView } from "@ft/core";
import { CarriedOver } from "./CarriedOver";
import { CashByAccount } from "./CashByAccount";
import type { PlanNames } from "./labels";
import { PlanRow } from "./PlanRow";
import { PlanTotals } from "./PlanTotals";

const param = (m: Month) => m.slice(0, 7);

/** ‹ month › (FR-004): from the earliest item start to 24 months ahead. */
export function MonthNav({ month, earliest, latest }: { month: Month; earliest: Month; latest: Month }) {
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const arrow = "inline-flex size-9 items-center justify-center rounded-md border border-border text-lg";
  return (
    <nav aria-label="Month" className="flex items-center gap-3">
      {prev >= earliest ? (
        <Link href={`/payment-plan?month=${param(prev)}`} className={`${arrow} hover:bg-muted`} aria-label={`Previous month, ${monthName(prev)}`}>
          ‹
        </Link>
      ) : (
        <span className={`${arrow} opacity-40`} aria-disabled="true" aria-label="No earlier month">
          ‹
        </span>
      )}
      <h2 id="plan-month" className="min-w-40 text-center text-lg font-semibold" aria-live="polite">
        {monthName(month)}
      </h2>
      {next <= latest ? (
        <Link href={`/payment-plan?month=${param(next)}`} className={`${arrow} hover:bg-muted`} aria-label={`Next month, ${monthName(next)}`}>
          ›
        </Link>
      ) : (
        <span className={`${arrow} opacity-40`} aria-disabled="true" aria-label="No later month">
          ›
        </span>
      )}
    </nav>
  );
}

/**
 * One month of the plan (US1): totals, the items by due date, what was carried over and cash needed
 * by account. `rowActions` adds the per-row actions (US2, US3).
 */
export function PlanMonth({
  view,
  items,
  names,
  currency,
  rowActions,
}: {
  view: PlanMonthView;
  items: ReadonlyMap<string, PlanItem>;
  names: PlanNames;
  currency: string;
  rowActions?: (row: PlanMonthView["rows"][number]) => React.ReactNode;
}) {
  const counted = view.countedHere && view.carried.length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PlanTotals
        totals={view.totals}
        currency={currency}
        carriedNote={counted ? `Includes ${view.carried.length === 1 ? "1 payment" : `${view.carried.length} payments`} carried over from earlier months.` : undefined}
      />

      {view.rows.length === 0 ? (
        <p className="text-muted-foreground">Nothing is planned for {monthName(view.month)}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <caption className="sr-only">Planned payments in {monthName(view.month)}, by due date</caption>
            <thead>
              <tr className="text-sm text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">Payment</th>
                <th scope="col" className="py-2 pr-3 font-medium">From</th>
                <th scope="col" className="py-2 pr-3 font-medium">Due</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Planned</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Paid</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <PlanRow key={`${row.itemId}|${row.month}`} row={row} item={items.get(row.itemId)!} names={names} currency={currency} actions={rowActions?.(row)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view.carried.length > 0 && <CarriedOver view={view} items={items} names={names} currency={currency} rowActions={rowActions} />}
      {view.cash.length > 0 && <CashByAccount cash={view.cash} names={names} currency={currency} />}
    </div>
  );
}
