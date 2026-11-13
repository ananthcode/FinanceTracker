import type { CashRow } from "@ft/core";
import { Money } from "@/components/Money";
import type { PlanNames } from "./labels";

/**
 * Cash by account (FR-015, US4 3): for the current month, what is still to be paid from each account
 * (due, overdue and carried over), what it has (a card: the credit still available) and how much it
 * is short by, in words.
 */
export function CashByAccount({ cash, names, currency }: { cash: readonly CashRow[]; names: PlanNames; currency: string }) {
  return (
    <section id="plan-cash" aria-labelledby="plan-cash-title" className="flex flex-col gap-2">
      <h2 id="plan-cash-title" className="text-lg font-semibold">
        Cash by account
      </h2>
      <ul className="flex flex-col gap-2">
        {cash.map((c) => (
          <li key={c.accountId} data-cash-account={names.account(c.accountId)} className="rounded-lg border border-border p-3">
            <p className="font-medium">{names.account(c.accountId)}</p>
            <p className="text-sm">
              Still to pay <Money value={c.leftMinor} currency={currency} />
              {c.availableMinor !== null && c.availableMinor < 0n ? (
                <>
                  {" · "}overdrawn by <Money value={-c.availableMinor} currency={currency} />
                </>
              ) : c.availableMinor !== null ? (
                <>
                  {" · "}available <Money value={c.availableMinor} currency={currency} />
                </>
              ) : (
                " · no credit limit set"
              )}
              {c.shortMinor > 0n && (
                <>
                  {" · "}
                  <strong>
                    short by <Money value={c.shortMinor} currency={currency} />
                  </strong>
                </>
              )}
              {c.availableMinor !== null && c.shortMinor === 0n && " · enough"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
