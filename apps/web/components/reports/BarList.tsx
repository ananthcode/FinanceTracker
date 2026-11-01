"use client";

import Link from "next/link";
import { Money } from "@/components/Money";
import { useDisplay } from "@/components/providers/DisplayProvider";

export interface Bar {
  key: string;
  label: string;
  amountMinor: bigint;
  /** Where selecting it goes (the next drill level), or none. */
  href?: string;
  /** The category's colour (the bar's fill); never the only cue — every bar is labelled in text. */
  colour?: string;
}

const share = (part: bigint, whole: bigint) => (whole > 0n && part > 0n ? Number((part * 1000n) / whole) / 10 : 0);

/**
 * A ranked list of horizontal bars (R6 FR-005, FR-008, research R6-07): each bar is a link with its
 * name, amount and share in words, so it works by keyboard and screen reader as it is; "Show as table"
 * gives the same numbers as a table. A negative amount (refunds above spending) is said in words, with
 * no bar.
 */
export function BarList({ title, bars, totalMinor, negativeWords }: { title: string; bars: Bar[]; totalMinor: bigint; negativeWords: string }) {
  // Hide-balances: bar lengths and shares would tell the amounts, so they go too.
  const { hideBalances } = useDisplay();
  const largest = bars.reduce((m, b) => (b.amountMinor > m ? b.amountMinor : m), 0n);
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={title} className="flex flex-col gap-2">
        {bars.map((b) => {
          const width = largest > 0n && b.amountMinor > 0n ? Math.max(1, Number((b.amountMinor * 100n) / largest)) : 0;
          const body = (
            <span className="flex flex-col gap-1">
              <span className="flex items-baseline gap-2">
                <span className="font-medium">{b.label}</span>
                <span className="ml-auto tabular-nums">
                  {b.amountMinor < 0n ? (
                    <>
                      <Money value={-b.amountMinor} /> {negativeWords}
                    </>
                  ) : (
                    <Money value={b.amountMinor} />
                  )}
                </span>
                {!hideBalances && b.amountMinor > 0n && (
                  <span className="w-14 text-right text-sm text-muted-foreground">{share(b.amountMinor, totalMinor)}%</span>
                )}
              </span>
              {!hideBalances && (
                <span aria-hidden="true" className="h-2 w-full rounded bg-muted">
                  <span className="block h-2 rounded" style={{ width: `${width}%`, background: b.colour ?? "var(--color-brand)" }} />
                </span>
              )}
            </span>
          );
          return (
            <li key={b.key}>
              {b.href ? (
                <Link href={b.href} className="block rounded-md p-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand">
                  {body}
                </Link>
              ) : (
                <div className="p-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Show as table</summary>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="py-1">Name</th>
              <th scope="col" className="text-right">Amount</th>
              <th scope="col" className="text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.key} className="border-t border-border">
                <th scope="row" className="py-1 text-left font-normal">
                  {b.label}
                </th>
                <td className="text-right tabular-nums">
                  {b.amountMinor < 0n ? (
                    <>
                      <Money value={-b.amountMinor} /> {negativeWords}
                    </>
                  ) : (
                    <Money value={b.amountMinor} />
                  )}
                </td>
                <td className="text-right">{!hideBalances && b.amountMinor > 0n ? `${share(b.amountMinor, totalMinor)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
