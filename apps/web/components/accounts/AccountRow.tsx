import { ACCOUNT_TYPE_LABEL, BALANCE_LABEL_TEXT, type AccountView, type SummaryRow } from "@ft/core";
import { Money } from "@/components/Money";
import { AccountIcon } from "./AccountIcon";

/**
 * One account in a list (FR-015, FR-006, FR-018): icon, name, type, balance with a word label —
 * never colour alone — and, for credit cards with a limit, what can still be spent.
 */
export function AccountRow({ row, children }: { row: SummaryRow<AccountView>; children?: React.ReactNode }) {
  const { account, balance, label, excluded, archivedWithBalance, available } = row;
  return (
    <li data-account-row={account.id} className="flex items-center gap-3 border-t border-border py-3 first:border-t-0">
      <AccountIcon icon={account.icon} colour={account.colour} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-medium break-words">{children ?? account.name}</p>
        <p className="text-xs text-muted-foreground">
          {ACCOUNT_TYPE_LABEL[account.type]}
          {excluded && " · excluded from net worth"}
          {archivedWithBalance && " · archived with a balance"}
        </p>
      </div>
      <div className="text-right">
        <p className="font-medium tabular-nums">
          <Money value={balance} currency={account.currency} />
          {label && <span className="ml-1 text-sm font-normal text-muted-foreground">{BALANCE_LABEL_TEXT[label]}</span>}
        </p>
        {available && account.creditLimitMinor !== null && (
          <p className="text-xs text-muted-foreground">
            {available.overLimit ? (
              <>
                Over limit by <Money value={available.overBy} currency={account.currency} />
              </>
            ) : (
              <>
                Available <Money value={available.available} currency={account.currency} /> of{" "}
                <Money value={account.creditLimitMinor} currency={account.currency} />
              </>
            )}
          </p>
        )}
      </div>
    </li>
  );
}
