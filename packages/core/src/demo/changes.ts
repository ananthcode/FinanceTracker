/**
 * The demo household as sync changes (R5 research R5-01): the R2 accounts, R3 lists and R4
 * transactions and rates for `todayIso`, in dependency order, every fixed demo id replaced by a fresh
 * UUID and every reference remapped. The server applies them through the push applier in one
 * transaction, so a load is validated and recorded like the user's own changes.
 */
import { formatHlc } from "../sync/hlc";
import type { ChangeInput } from "../sync/schemas";
import { demoAccounts } from "./accounts";
import { demoLists } from "./lists";
import { demoTransactions } from "./transactions";

/** The device id in the demo changes' clock (a valid HLC device, not a real device). */
export const DEMO_HLC_DEVICE = "demodata";

export interface DemoChangesOptions {
  /** Wall-clock time for the changes' HLCs (default: now). */
  now?: number;
  /** Id factory (default: crypto.randomUUID). */
  newId?: () => string;
}

export function demoChanges(todayIso: string, options: DemoChangesOptions = {}): ChangeInput[] {
  const now = options.now ?? Date.now();
  const newId = options.newId ?? (() => crypto.randomUUID());
  const ids = new Map<string, string>();
  const to = (id: string) => ids.get(id) ?? ids.set(id, newId()).get(id)!;
  const toNullable = (id: string | null) => (id === null ? null : to(id));
  const changes: ChangeInput[] = [];
  const add = (entity: ChangeInput["entity"], entityId: string, kind: ChangeInput["kind"], fields?: Record<string, unknown>) => {
    // Increasing clock: the counter carries up to 9,999 changes in one millisecond.
    const n = changes.length;
    const hlc = formatHlc({ wall: now + Math.floor(n / 10_000), counter: n % 10_000, device: DEMO_HLC_DEVICE });
    changes.push({ changeId: newId(), entity, entityId, kind, ...(fields ? { fields } : {}), hlc });
  };

  const { groups, accounts } = demoAccounts();
  for (const g of groups) add("account_group", to(g.id), "create", { name: g.name, sortKey: g.sortKey });
  for (const a of accounts) {
    add("account", to(a.id), "create", {
      name: a.name,
      type: a.type,
      openingBalanceMinor: a.openingBalanceMinor.toString(),
      openingBalanceDate: a.openingBalanceDate,
      colour: a.colour,
      icon: a.icon,
      sortKey: a.sortKey,
      groupId: toNullable(a.groupId),
      includeInNetWorth: a.includeInNetWorth,
      notes: a.notes,
      creditLimitMinor: a.creditLimitMinor?.toString() ?? null,
    });
  }
  for (const a of accounts) if (a.state === "archived") add("account", to(a.id), "archive");

  const { categories, tags, payees } = demoLists();
  // Parents before children (the generator lists them in tree order).
  for (const c of categories) {
    add("category", to(c.id), "create", {
      name: c.name,
      kind: c.kind,
      parentId: toNullable(c.parentId),
      colour: c.colour,
      icon: c.icon,
      hidden: c.hidden,
    });
  }
  for (const t of tags) add("tag", to(t.id), "create", { name: t.name });
  for (const p of payees) {
    add("payee", to(p.id), "create", {
      name: p.name,
      kind: p.kind,
      defaultCategoryId: toNullable(p.defaultCategoryId),
      notes: p.notes,
      hidden: p.hidden,
      openingBalanceMinor: p.openingBalanceMinor.toString(),
      openingBalanceDate: p.openingBalanceDate,
      includeInNetWorth: p.includeInNetWorth,
      interestMode: p.interestMode,
    });
  }

  const { transactions, rates } = demoTransactions(todayIso);
  for (const r of rates) add("person_rate", to(r.id), "create", { payeeId: to(r.payeeId), effectiveMonth: r.effectiveMonth, rateE4: r.rateE4 });
  for (const t of transactions) {
    add("transaction", to(t.id), "create", {
      kind: t.kind,
      date: t.date,
      timeOfDay: t.timeOfDay,
      accountId: toNullable(t.accountId),
      toAccountId: toNullable(t.toAccountId),
      amountMinor: t.amountMinor.toString(),
      payeeId: toNullable(t.payeeId),
      personAction: t.personAction,
      ...(t.kind === "interest" || t.personAction === "adjustment" ? { flow: t.flow } : {}),
      categoryId: toNullable(t.categoryId),
      lines: t.lines.map((l) => ({
        id: newId(),
        amountMinor: l.amountMinor.toString(),
        categoryId: toNullable(l.categoryId),
        personId: toNullable(l.personId),
        personAction: l.personAction,
        notes: l.notes,
        tagIds: l.tagIds.map(to),
      })),
      tagIds: t.tagIds.map(to),
      notes: t.notes,
      reference: t.reference,
      status: t.status,
      confirmed: t.confirmed,
    });
  }
  return changes;
}
