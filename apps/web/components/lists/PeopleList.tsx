"use client";

import Link from "next/link";
import { compareNames, peopleTotals, personBalance, type PayeeView } from "@ft/core";
import { Money } from "@/components/Money";
import { PersonBalance } from "./PersonBalance";

/**
 * The People screen body (R3 US3; FR-018, FR-019, FR-034): the two totals, then every person with
 * their balance in words; hidden people in a collapsible section. Every amount goes through
 * <Money>, so hide-balances masks them all (FR-021).
 */
export function PeopleList({ people }: { people: PayeeView[] }) {
  const totals = peopleTotals(people);
  const sorted = [...people].sort((a, b) => compareNames(a.name, b.name));
  const shown = sorted.filter((p) => !p.hidden);
  const hidden = sorted.filter((p) => p.hidden);

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="People totals">
        <div className="rounded-md border border-border p-3">
          <dt className="text-sm text-muted-foreground">People owe you</dt>
          <dd id="people-owe-you" className="text-xl font-semibold">
            <Money value={totals.owedToYou} />
          </dd>
        </div>
        <div className="rounded-md border border-border p-3">
          <dt className="text-sm text-muted-foreground">You owe people</dt>
          <dd id="you-owe-people" className="text-xl font-semibold">
            <Money value={totals.youOwe} />
          </dd>
        </div>
      </dl>

      {people.length === 0 ? (
        <p className="text-muted-foreground">
          No people yet. Add the people you lend to or borrow from — family, friends, a landlord — to keep track of who
          owes whom.
        </p>
      ) : (
        <ul aria-label="People" className="flex flex-col divide-y divide-border">
          {shown.map((p) => (
            <PersonRow key={p.id} person={p} />
          ))}
        </ul>
      )}

      {hidden.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Hidden people ({hidden.length})</summary>
          <ul aria-label="Hidden people" className="mt-2 flex flex-col divide-y divide-border">
            {hidden.map((p) => (
              <PersonRow key={p.id} person={p} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function PersonRow({ person }: { person: PayeeView }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2" data-person-name={person.name}>
      <Link href={`/people/${person.id}`} className="font-medium text-brand-strong hover:underline dark:text-brand">
        {person.name}
      </Link>
      {person.includeInNetWorth && <span className="text-xs text-muted-foreground">In net worth</span>}
      <PersonBalance balance={personBalance(person)} className="ml-auto" />
    </li>
  );
}
