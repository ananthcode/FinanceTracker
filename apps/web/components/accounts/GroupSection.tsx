import { ACCOUNT_TYPE_GROUP_TITLE, type AccountView, type SummarySection } from "@ft/core";
import { Money } from "@/components/Money";
import { AccountRow } from "./AccountRow";

const SUBTOTAL_WORD = { owned: null, owed: "owed", net: "net" } as const;

/**
 * One group of accounts with its subtotal (FR-017): what is held, what is owed (credit cards), or
 * "net" — held minus owed — when a user group mixes both kinds. Excluded accounts are listed but
 * left out of the subtotal (FR-018).
 */
export function GroupSection({ section, currency }: { section: SummarySection<AccountView>; currency: string }) {
  const title = section.type ? ACCOUNT_TYPE_GROUP_TITLE[section.type] : (section.group?.name ?? "Ungrouped");
  const headingId = `group-${section.key}`;
  const word = SUBTOTAL_WORD[section.subtotalKind];

  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1">
        <h2 id={headingId} className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
        <p data-subtotal className="text-sm font-medium tabular-nums">
          <span className="sr-only">Subtotal: </span>
          <Money value={section.subtotal} currency={currency} />
          {word && <span className="font-normal text-muted-foreground"> {word}</span>}
        </p>
      </div>
      {section.rows.length > 0 ? (
        <ul>
          {section.rows.map((row) => (
            <AccountRow key={row.account.id} row={row} />
          ))}
        </ul>
      ) : (
        <p className="py-3 text-sm text-muted-foreground">No accounts in this group yet.</p>
      )}
    </section>
  );
}
