"use client";

import Link from "next/link";
import { statementClosing, statementSignMeaning, type PersonStatement } from "@ft/core";
import { DateText } from "@/components/DateText";
import { Money } from "@/components/Money";
import { useDisplay } from "@/components/providers/DisplayProvider";

/** A figure with its sign, through <Money>; with hide-balances on, the sign goes too. */
function Signed({ value, plus = false }: { value: bigint; plus?: boolean }) {
  const { hideBalances } = useDisplay();
  const sign = hideBalances ? "" : value < 0n ? "−" : plus && value > 0n ? "+" : "";
  return (
    <span className="whitespace-nowrap tabular-nums">
      {sign}
      <Money value={value < 0n ? -value : value} />
    </span>
  );
}

/**
 * The statement on screen (R6 FR-009, FR-013; spec US4 1, 2, 4, 5): opening balance, every counted
 * movement with type, signed amount and running balance, and the closing balance in words. Notes always
 * show here; every amount goes through <Money>, so hide-balances masks them.
 */
export function StatementView({ statement, personName, returnTo }: { statement: PersonStatement; personName: string; returnTo: string }) {
  const closing = statementClosing(personName, statement.realClosingMinor);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{statementSignMeaning(personName, statement.sign)}</p>
      <p className="flex items-baseline gap-2 font-medium">
        Opening balance
        <span id="statement-opening" className="ml-auto">
          <Signed value={statement.openingMinor} />
        </span>
      </p>

      {statement.rows.length === 0 ? (
        <p className="text-muted-foreground">No movements in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Movements with {personName}</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 pr-3">Date</th>
                <th scope="col" className="pr-3">Type</th>
                <th scope="col" className="pr-3 text-right">Amount</th>
                <th scope="col" className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {statement.rows.map((r) => (
                <tr key={r.transactionId} className="border-t border-border align-baseline" data-statement-row>
                  <td className="whitespace-nowrap py-2 pr-3">
                    <DateText date={r.date} />
                  </td>
                  <td className="pr-3">
                    <Link href={`/transactions/${r.transactionId}?returnTo=${encodeURIComponent(returnTo)}`} className="text-brand-strong hover:underline dark:text-brand">
                      {r.label}
                    </Link>
                    {r.notes && <p className="text-muted-foreground">{r.notes}</p>}
                  </td>
                  <td className="pr-3 text-right" data-statement-amount>
                    <Signed value={r.amountMinor} plus />
                  </td>
                  <td className="text-right" data-statement-balance>
                    <Signed value={r.balanceMinor} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-baseline gap-2 border-t border-border pt-2 font-medium">
        Closing balance
        <span id="statement-closing" className="ml-auto text-lg font-semibold" data-closing-figure={statement.closingMinor.toString()}>
          {closing.words}
          {closing.amountMinor !== null && (
            <>
              {" "}
              <Money value={closing.amountMinor} />
            </>
          )}
        </span>
      </p>
    </div>
  );
}
