/**
 * Net-worth summary (FR-016–FR-019, FR-022). One function builds every figure the accounts screen
 * shows, so the R6 dashboard and R7 payment plan can show identical numbers (FR-019).
 *
 * Totals count active accounts and archived accounts whose balance is no longer zero (flagged
 * "archived with a balance"), in both cases only when included in net worth. Group subtotals cover
 * the accounts listed in that group.
 */
import { availableCredit, currentBalance, type AvailableCredit, type Movement } from "./balance";
import { balanceLabel, type BalanceLabel } from "./labels";
import { isOwedType, TYPE_ORDER, type AccountState, type AccountType, type AccountsView, type GroupState } from "./types";

export interface AccountForSummary {
  id: string;
  type: AccountType;
  openingBalanceMinor: bigint;
  openingBalanceDate: string;
  state: AccountState;
  includeInNetWorth: boolean;
  groupId: string | null;
  sortKey: string;
  creditLimitMinor: bigint | null;
}

export interface GroupForSummary {
  id: string;
  name: string;
  sortKey: string;
  state: GroupState;
}

export interface SummaryRow<A extends AccountForSummary = AccountForSummary> {
  account: A;
  balance: bigint;
  label: BalanceLabel | null;
  excluded: boolean;
  archivedWithBalance: boolean;
  available: AvailableCredit | null;
}

export type SubtotalKind = "owned" | "owed" | "net";

export interface SummarySection<A extends AccountForSummary = AccountForSummary> {
  /** Account type ("By type"), group id, or "ungrouped". */
  key: string;
  kind: "type" | "group" | "ungrouped";
  type?: AccountType;
  group?: GroupForSummary;
  rows: SummaryRow<A>[];
  /** Owned sum, owed sum, or owned − owed when a user group mixes both kinds. */
  subtotal: bigint;
  subtotalKind: SubtotalKind;
}

export interface AccountsSummary<A extends AccountForSummary = AccountForSummary> {
  owned: bigint;
  owed: bigint;
  netWorth: bigint;
  sections: SummarySection<A>[];
  archived: SummaryRow<A>[];
}

export interface SummaryOptions {
  view: AccountsView;
  groups?: readonly GroupForSummary[];
  movements?: readonly Movement[];
}

const byKey = <T extends { sortKey: string; id: string }>(a: T, b: T): number =>
  a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function rowOf<A extends AccountForSummary>(account: A, movements: readonly Movement[]): SummaryRow<A> {
  const balance = currentBalance(account, movements);
  return {
    account,
    balance,
    label: balanceLabel(account.type, balance),
    excluded: !account.includeInNetWorth,
    archivedWithBalance: account.state === "archived" && balance !== 0n,
    available: availableCredit(account, balance),
  };
}

function subtotalOf(rows: readonly SummaryRow[]): { subtotal: bigint; subtotalKind: SubtotalKind } {
  const included = rows.filter((r) => !r.excluded);
  const owedKinds = rows.map((r) => isOwedType(r.account.type));
  let owned = 0n;
  let owed = 0n;
  for (const r of included) {
    if (isOwedType(r.account.type)) owed += r.balance;
    else owned += r.balance;
  }
  if (rows.length > 0 && owedKinds.every(Boolean)) return { subtotal: owed, subtotalKind: "owed" };
  if (owedKinds.some(Boolean)) return { subtotal: owned - owed, subtotalKind: "net" };
  return { subtotal: owned, subtotalKind: "owned" };
}

export function summarise<A extends AccountForSummary>(accounts: readonly A[], options: SummaryOptions): AccountsSummary<A> {
  const movements = options.movements ?? [];
  const visible = accounts.filter((a) => a.state !== "deleted").sort(byKey);
  const rows = visible.map((a) => rowOf(a, movements));
  const active = rows.filter((r) => r.account.state === "active");
  const archived = rows.filter((r) => r.account.state === "archived");

  let owned = 0n;
  let owed = 0n;
  for (const r of [...active, ...archived.filter((x) => x.archivedWithBalance)]) {
    if (r.excluded) continue;
    if (isOwedType(r.account.type)) owed += r.balance;
    else owned += r.balance;
  }

  const sections: SummarySection<A>[] = [];
  if (options.view === "by_type") {
    for (const type of TYPE_ORDER) {
      const inType = active.filter((r) => r.account.type === type);
      if (inType.length === 0) continue;
      sections.push({ key: type, kind: "type", type, rows: inType, ...subtotalOf(inType) });
    }
  } else {
    const groups = (options.groups ?? []).filter((g) => g.state === "active").sort(byKey);
    const groupIds = new Set(groups.map((g) => g.id));
    for (const group of groups) {
      const inGroup = active.filter((r) => r.account.groupId === group.id);
      sections.push({ key: group.id, kind: "group", group, rows: inGroup, ...subtotalOf(inGroup) });
    }
    // Accounts in no group, or in a deleted group, are "Ungrouped".
    const ungrouped = active.filter((r) => r.account.groupId === null || !groupIds.has(r.account.groupId));
    if (ungrouped.length > 0) sections.push({ key: "ungrouped", kind: "ungrouped", rows: ungrouped, ...subtotalOf(ungrouped) });
  }

  return { owned, owed, netWorth: owned - owed, sections, archived };
}

/** Accounts that may be chosen for new records (FR-021): active only, in the user's order. */
export function selectableAccounts<A extends Pick<AccountForSummary, "state" | "sortKey" | "id">>(accounts: readonly A[]): A[] {
  return accounts.filter((a) => a.state === "active").sort(byKey);
}
