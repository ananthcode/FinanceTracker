import Link from "next/link";
import { PERSON_LABEL_TEXT, personLabel } from "@ft/core";
import { Money } from "@/components/Money";

export interface PersonOwed {
  id: string;
  name: string;
  /** Positive: they owe the user. Negative: the user owes them. */
  balanceMinor: bigint;
}

/**
 * Money owed to / by people (FR-017, US5 2): every person with a balance, the direction in words, and
 * totals that equal the People screen's (same balances, same function). Bank-loan outstanding joins
 * this panel in Phase 3.
 */
export function PeopleOwed({ people, owedToYou, youOwe, currency }: { people: readonly PersonOwed[]; owedToYou: bigint; youOwe: bigint; currency: string }) {
  return (
    <section id="plan-people" aria-labelledby="plan-people-title" className="flex flex-col gap-2">
      <h2 id="plan-people-title" className="text-lg font-semibold">
        Money owed to / by people
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-lg border border-border p-3">
          <dt className="text-sm text-muted-foreground">People owe you</dt>
          <dd id="plan-people-owe-you" className="font-semibold tabular-nums">
            <Money value={owedToYou} currency={currency} />
          </dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-sm text-muted-foreground">You owe people</dt>
          <dd id="plan-you-owe-people" className="font-semibold tabular-nums">
            <Money value={youOwe} currency={currency} />
          </dd>
        </div>
      </dl>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody owes you and you owe nobody.</p>
      ) : (
        <ul className="flex flex-col">
          {people.map((p) => (
            <li key={p.id} data-plan-person={p.name} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border py-1.5 first:border-t-0">
              <Link href={`/people/${p.id}`} className="font-medium hover:underline">
                {p.name}
              </Link>
              <span className="text-sm">
                {PERSON_LABEL_TEXT[personLabel(p.balanceMinor)]} <Money value={p.balanceMinor < 0n ? -p.balanceMinor : p.balanceMinor} currency={currency} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
