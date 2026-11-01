"use client";

import Link from "next/link";
import type { TrendMonth } from "@ft/core";
import { Money } from "@/components/Money";
import { useDisplay } from "@/components/providers/DisplayProvider";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const label = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`;

/**
 * Income and spending per month (R6 US3; FR-007, FR-008): paired bars (income solid, spending
 * striped — not colour alone), each month a link to that month's spending; the table below gives
 * every number in words. With hide-balances on, the bars are hidden too (their heights tell amounts).
 */
export function TrendChart({ months }: { months: TrendMonth[] }) {
  const { hideBalances } = useDisplay();
  const largest = months.reduce((m, x) => {
    const top = x.incomeMinor > x.spendingMinor ? x.incomeMinor : x.spendingMinor;
    return top > m ? top : m;
  }, 0n);
  const height = (v: bigint) => (largest > 0n && v > 0n ? Math.max(1, Number((v * 140n) / largest)) : 0);
  const step = 56;

  return (
    <div className="flex flex-col gap-4">
      {!hideBalances && (
        <div className="overflow-x-auto">
          <svg role="img" aria-label="Income and spending per month — the same numbers are in the table below" width={months.length * step + 16} height={180} className="text-foreground">
            <defs>
              <pattern id="spending-stripes" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--color-muted)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="3" />
              </pattern>
            </defs>
            {months.map((m, i) => {
              const x = 8 + i * step;
              const hi = height(m.incomeMinor);
              const hs = height(m.spendingMinor);
              return (
                <g key={m.month}>
                  <rect x={x} y={150 - hi} width={20} height={hi} fill="var(--color-brand)" />
                  <rect x={x + 22} y={150 - hs} width={20} height={hs} fill="url(#spending-stripes)" />
                  <text x={x + 21} y={168} textAnchor="middle" fontSize="11" fill="currentColor">
                    {label(m.month)}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="text-sm text-muted-foreground">
            Solid: income · Striped: spending
          </p>
        </div>
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">Income, spending and net per month</caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th scope="col" className="py-1">Month</th>
            <th scope="col" className="text-right">Income</th>
            <th scope="col" className="text-right">Spending</th>
            <th scope="col" className="text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month} className="border-t border-border">
              <th scope="row" className="py-1 text-left font-normal">
                <Link href={`/reports?view=spending&period=custom&from=${m.month}&to=${monthEnd(m.month)}`} className="text-brand-strong underline dark:text-brand">
                  {FULL_MONTHS[Number(m.month.slice(5, 7)) - 1]} {m.month.slice(0, 4)}
                </Link>
              </th>
              <td className="text-right tabular-nums">
                <Money value={m.incomeMinor} />
              </td>
              <td className="text-right tabular-nums">
                <Money value={m.spendingMinor} />
              </td>
              <td className="text-right tabular-nums">
                <Money value={m.netMinor < 0n ? -m.netMinor : m.netMinor} />
                {m.netMinor < 0n && " overspent"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function monthEnd(first: string): string {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}
