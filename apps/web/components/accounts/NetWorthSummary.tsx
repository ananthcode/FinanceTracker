import type { AccountsSummary } from "@ft/core";
import { Money } from "@/components/Money";

/**
 * Owned, Owed and Net worth for the user's included accounts (FR-016, FR-019). Every figure comes
 * from summarise() in packages/core; a negative net worth has a sign and words (US2 scenario 6).
 */
export function NetWorthSummary({ summary, currency }: { summary: AccountsSummary; currency: string }) {
  const counted = [...summary.sections.flatMap((s) => s.rows), ...summary.archived.filter((r) => r.archivedWithBalance)].filter(
    (r) => !r.excluded,
  ).length;
  const negative = summary.netWorth < 0n;

  return (
    <section aria-labelledby="net-worth-title" className="rounded-lg border border-border p-4">
      <h2 id="net-worth-title" className="sr-only">
        Net worth summary
      </h2>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div id="figure-owned">
          <dt className="text-sm text-muted-foreground">Owned</dt>
          <dd className="text-xl font-semibold tabular-nums">
            <Money value={summary.owned} currency={currency} />
          </dd>
        </div>
        <div id="figure-owed">
          <dt className="text-sm text-muted-foreground">Owed</dt>
          <dd className="text-xl font-semibold tabular-nums">
            <Money value={summary.owed} currency={currency} />
          </dd>
        </div>
        <div id="figure-net-worth">
          <dt className="text-sm text-muted-foreground">Net worth</dt>
          <dd className="text-xl font-semibold tabular-nums">
            <Money value={summary.netWorth} currency={currency} />
            {negative && <span className="text-sm font-normal text-muted-foreground"> more owed than owned</span>}
          </dd>
        </div>
      </dl>
      {counted === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Net worth is ₹0.00 because none of your accounts count towards it: they are archived or set not to be
          included in net worth.
        </p>
      )}
    </section>
  );
}
