import { monthName, type PlanItem, type PlanMonthView } from "@ft/core";
import type { PlanNames } from "./labels";
import { PlanRow } from "./PlanRow";

/**
 * Carried over (FR-014, US4 2): months that ended unpaid, as Overdue with their own month and due
 * date. They count in the current month's totals only; other months say where they are counted.
 */
export function CarriedOver({
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
  const note = view.countedHere ? undefined : `Counted in ${monthName(view.currentMonth)}`;
  return (
    <section id="plan-carried" aria-labelledby="plan-carried-title" className="flex flex-col gap-2">
      <h2 id="plan-carried-title" className="text-lg font-semibold">
        Carried over
      </h2>
      <p className="text-sm text-muted-foreground">
        Not paid in their own month. They stay here until they are paid or skipped
        {view.countedHere ? ", and are included in this month's totals." : "."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <caption className="sr-only">Payments carried over from earlier months</caption>
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
            {view.carried.map((row) => (
              <PlanRow
                key={`${row.itemId}|${row.month}`}
                row={row}
                item={items.get(row.itemId)!}
                names={names}
                currency={currency}
                showMonth
                countedNote={note}
                actions={rowActions?.(row)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
