import Link from "next/link";
import { monthName, type PlanItem, type PlanRow as Row } from "@ft/core";
import { DateText } from "@/components/DateText";
import { Money } from "@/components/Money";
import { paysText, statusText, statusTone, type PlanNames } from "./labels";

/**
 * One item-month of the plan (FR-001, FR-002): name and what it pays, from-account, due date,
 * planned (with "estimated" / "Amount not set"), paid and links, status in words, and actions.
 */
export function PlanRow({
  row,
  item,
  names,
  currency,
  showMonth = false,
  countedNote,
  actions,
}: {
  row: Row;
  item: PlanItem;
  names: PlanNames;
  currency: string;
  /** Carried-over rows name their own month. */
  showMonth?: boolean;
  /** "Counted in November 2026" for carried rows outside the current month. */
  countedNote?: string;
  actions?: React.ReactNode;
}) {
  return (
    <tr data-plan-row={row.itemId} data-name={row.name} data-month={row.month} data-due={row.dueDate} data-status={row.status} className="border-t border-border align-top">
      <th scope="row" className="py-2 pr-3 text-left font-medium">
        {row.removed ? (
          <span>{row.name}</span>
        ) : (
          <Link href={`/payment-plan/${row.itemId}?month=${row.month.slice(0, 7)}`} className="hover:underline">
            {row.name}
          </Link>
        )}
        {row.removed && <span className="ml-1 text-sm font-normal text-muted-foreground">(removed)</span>}
        <span className="block text-sm font-normal text-muted-foreground">{paysText(item, names)}</span>
        {showMonth && (
          <span className="block text-sm font-normal text-muted-foreground">
            For {monthName(row.month)}
          </span>
        )}
      </th>
      <td className="py-2 pr-3 text-sm">{names.account(row.accountId)}</td>
      <td className="py-2 pr-3 text-sm whitespace-nowrap">
        <DateText date={row.dueDate} />
      </td>
      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
        {row.notSet ? (
          <span className="text-sm">Amount not set</span>
        ) : (
          <Money value={row.plannedMinor} currency={currency} />
        )}
        {row.estimated && <span className="block text-xs text-muted-foreground">estimated</span>}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
        <Money value={row.paidMinor} currency={currency} />
        {row.leftMinor > 0n && row.paidMinor > 0n && (
          <span className="block text-xs text-muted-foreground">
            <Money value={row.leftMinor} currency={currency} /> left
          </span>
        )}
        {row.overpaidMinor > 0n && (
          <span className="block text-xs text-muted-foreground">
            <Money value={row.overpaidMinor} currency={currency} /> more than planned
          </span>
        )}
        {row.upcomingMinor > 0n && (
          <span className="block text-xs text-muted-foreground">
            Upcoming payment linked: <Money value={row.upcomingMinor} currency={currency} />
          </span>
        )}
        {row.links.length > 0 && (
          <ul aria-label={`Payments for ${row.name}`} className="mt-1 text-xs">
            {row.links.map((l) => (
              <li key={l.id}>
                <Link href={`/transactions/${l.id}`} className="underline">
                  <Money value={l.amountMinor} currency={currency} /> on <DateText date={l.date} />
                </Link>
                {!l.counted && <span className="text-muted-foreground"> (not paid yet)</span>}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="py-2 pr-3">
        <span className={`inline-block rounded border px-2 py-0.5 text-sm ${statusTone(row.status)}`} data-plan-status>
          {statusText(row)}
        </span>
        {countedNote && <span className="block text-xs text-muted-foreground">{countedNote}</span>}
      </td>
      <td className="py-2">{actions}</td>
    </tr>
  );
}
