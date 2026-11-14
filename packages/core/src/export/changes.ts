/**
 * A backup → the create changes that restore it (R10-05), as R5's demo load: every id fresh and every
 * reference remapped, in dependency order, each change checked by the same shapes as a push. Archiving
 * comes last, so transactions on archived accounts are created first. Plan links and template ties to plan
 * items that are not in the backup are dropped; any other missing reference is a problem.
 */
import { occurrenceId } from "../plan/months";
import { formatHlc } from "../sync/hlc";
import { Change, type ChangeInput } from "../sync/schemas";
import type { BackupFile, WireRow } from "./backup";

export const IMPORT_HLC_DEVICE = "backupimport";
/** Changes per import request: about 2 s of checks each, inside the request limits (R10-05). */
export const MAX_CHANGES_PER_IMPORT_CHUNK = 500;

export interface InterestMarks {
  proposals: { transactionId: string; interestMonth: string; userEdited: boolean }[];
  declined: { payeeId: string; month: string }[];
}

export interface RestoredAttachment {
  /** The attachment's id in the backup (its file in a zip is found by it). */
  backupId: string;
  transactionId: string;
  name: string;
  contentType: string;
  sizeBytes: number;
}

export interface BackupPlan {
  changes: ChangeInput[];
  interest: InterestMarks;
  attachments: RestoredAttachment[];
  /** Problems in words (at most `limit`); none means the backup can be imported. */
  problems: string[];
}

const money = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** Parents before children. */
function categoryOrder(rows: WireRow[]): WireRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: WireRow[] = [];
  const seen = new Set<string>();
  const visit = (r: WireRow, depth: number) => {
    if (seen.has(r.id) || depth > 20) return;
    const parent = r.parentId ? byId.get(String(r.parentId)) : undefined;
    if (parent) visit(parent, depth + 1);
    seen.add(r.id);
    out.push(r);
  };
  for (const r of rows) visit(r, 0);
  return out;
}

export function backupChanges(
  backup: BackupFile,
  options: { newId?: () => string; now?: number; limit?: number } = {},
): BackupPlan {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const now = options.now ?? Date.now();
  const limit = options.limit ?? 10;
  const r = backup.records;
  const problems: string[] = [];
  const problem = (text: string) => {
    if (problems.length < limit) problems.push(text);
  };

  const known = {
    account: new Set(r.account.map((x) => x.id)),
    account_group: new Set(r.account_group.map((x) => x.id)),
    category: new Set(r.category.map((x) => x.id)),
    tag: new Set(r.tag.map((x) => x.id)),
    payee: new Set(r.payee.map((x) => x.id)),
    plan_item: new Set(r.plan_item.map((x) => x.id)),
    transaction: new Set(r.transaction.map((x) => x.id)),
  };
  const ids = new Map<string, string>();
  const to = (id: string) => ids.get(id) ?? ids.set(id, newId()).get(id)!;
  /** A remapped reference, or null; a missing one is a problem (what refers, to what kind). */
  const ref = (v: unknown, kind: keyof typeof known, who: string): string | null => {
    if (v === null || v === undefined) return null;
    const id = String(v);
    if (!known[kind].has(id)) {
      problem(`${who} refers to ${kind.replace("_", " ")} that is not in the backup.`);
      return null;
    }
    return to(id);
  };

  const changes: ChangeInput[] = [];
  const labels: string[] = [];
  const add = (label: string, entity: ChangeInput["entity"], entityId: string, kind: ChangeInput["kind"], fields?: Record<string, unknown>) => {
    const n = changes.length;
    const hlc = formatHlc({ wall: now + Math.floor(n / 10_000), counter: n % 10_000, device: IMPORT_HLC_DEVICE });
    changes.push({ changeId: newId(), entity, entityId, kind, ...(fields ? { fields } : {}), hlc });
    labels.push(label);
  };

  for (const g of r.account_group) add(`Account group "${g.name}"`, "account_group", to(g.id), "create", { name: g.name, sortKey: g.sortKey });
  for (const a of r.account) {
    const who = `Account "${a.name}"`;
    add(who, "account", to(a.id), "create", {
      name: a.name,
      type: a.type,
      openingBalanceMinor: money(a.openingBalanceMinor),
      openingBalanceDate: a.openingBalanceDate,
      colour: a.colour,
      icon: a.icon,
      sortKey: a.sortKey,
      groupId: ref(a.groupId, "account_group", who),
      includeInNetWorth: a.includeInNetWorth,
      notes: a.notes ?? null,
      creditLimitMinor: money(a.creditLimitMinor),
    });
  }
  for (const c of categoryOrder(r.category)) {
    const who = `Category "${c.name}"`;
    add(who, "category", to(c.id), "create", {
      name: c.name,
      kind: c.kind,
      parentId: ref(c.parentId, "category", who),
      colour: c.colour,
      icon: c.icon,
      hidden: c.hidden === true,
    });
  }
  for (const t of r.tag) add(`Tag "${t.name}"`, "tag", to(t.id), "create", { name: t.name });
  for (const p of r.payee) {
    const who = `${p.kind === "person" ? "Person" : "Payee"} "${p.name}"`;
    add(who, "payee", to(p.id), "create", {
      name: p.name,
      kind: p.kind,
      defaultCategoryId: ref(p.defaultCategoryId, "category", who),
      notes: p.notes ?? null,
      hidden: p.hidden === true,
      openingBalanceMinor: money(p.openingBalanceMinor) ?? "0",
      openingBalanceDate: p.openingBalanceDate ?? null,
      includeInNetWorth: p.includeInNetWorth === true,
      interestMode: p.interestMode ?? "none",
      statementSign: p.statementSign ?? "they_owe_positive",
    });
  }
  for (const x of r.person_rate) {
    const who = `An interest rate from ${x.effectiveMonth}`;
    add(who, "person_rate", to(x.id), "create", { payeeId: ref(x.payeeId, "payee", who), effectiveMonth: x.effectiveMonth, rateE4: x.rateE4 });
  }
  for (const i of r.plan_item) {
    const who = `Planned payment "${i.name}"`;
    const terms = Array.isArray(i.terms) ? (i.terms as Record<string, unknown>[]) : [];
    add(who, "plan_item", to(i.id), "create", {
      name: i.name,
      target: i.target,
      payeeId: ref(i.payeeId, "payee", who),
      categoryId: ref(i.categoryId, "category", who),
      cardAccountId: ref(i.cardAccountId, "account", who),
      personAction: i.personAction ?? null,
      frequency: i.frequency,
      intervalMonths: i.intervalMonths,
      startMonth: i.startMonth,
      endMonth: i.endMonth ?? null,
      amountVaries: i.amountVaries === true,
      terms: terms.map((t) => ({ fromMonth: t.fromMonth, amountMinor: money(t.amountMinor), dueDay: t.dueDay, accountId: ref(t.accountId, "account", who) })),
      notes: i.notes ?? null,
    });
  }
  for (const o of r.plan_occurrence) {
    if (!known.plan_item.has(String(o.itemId))) continue; // its item is gone: nothing to restore
    const fields: Record<string, unknown> = { itemId: to(String(o.itemId)), month: o.month };
    if (o.amountMinor !== null && o.amountMinor !== undefined) fields.amountMinor = money(o.amountMinor);
    if (o.skipped === true) fields.skipped = true;
    if (!("amountMinor" in fields) && !("skipped" in fields)) continue;
    add(`A planned-payment month (${o.month})`, "plan_occurrence", occurrenceId(String(fields.itemId), String(o.month)), "create", fields);
  }
  const lines = (v: unknown, who: string) =>
    (Array.isArray(v) ? (v as Record<string, unknown>[]) : []).map((l) => ({
      id: newId(),
      amountMinor: money(l.amountMinor),
      categoryId: ref(l.categoryId, "category", who),
      personId: ref(l.personId, "payee", who),
      personAction: l.personAction ?? null,
      notes: l.notes ?? null,
      tagIds: (Array.isArray(l.tagIds) ? (l.tagIds as string[]) : []).map((t) => ref(t, "tag", who)).filter((t): t is string => t !== null),
    }));
  const tagList = (v: unknown, who: string) =>
    (Array.isArray(v) ? (v as string[]) : []).map((t) => ref(t, "tag", who)).filter((t): t is string => t !== null);

  for (const t of r.template) {
    const who = `Template "${t.name}"`;
    add(who, "template", to(t.id), "create", {
      name: t.name,
      kind: t.kind,
      accountId: ref(t.accountId, "account", who),
      toAccountId: ref(t.toAccountId, "account", who),
      amountMinor: money(t.amountMinor),
      payeeId: ref(t.payeeId, "payee", who),
      personAction: t.personAction ?? null,
      categoryId: ref(t.categoryId, "category", who),
      lines: lines(t.lines, who),
      tagIds: tagList(t.tagIds, who),
      notes: t.notes ?? null,
      planItemId: t.planItemId && known.plan_item.has(String(t.planItemId)) ? to(String(t.planItemId)) : null,
      sortKey: t.sortKey,
      hidden: t.hidden === true,
    });
  }

  const interest: InterestMarks = { proposals: [], declined: [] };
  for (const t of r.transaction) {
    const who = `The transaction on ${t.date}`;
    const fields: Record<string, unknown> = {
      kind: t.kind,
      date: t.date,
      timeOfDay: t.timeOfDay ? String(t.timeOfDay).slice(0, 5) : null,
      accountId: ref(t.accountId, "account", who),
      toAccountId: ref(t.toAccountId, "account", who),
      amountMinor: money(t.amountMinor),
      payeeId: ref(t.payeeId, "payee", who),
      personAction: t.personAction ?? null,
      categoryId: ref(t.categoryId, "category", who),
      lines: lines(t.lines, who),
      tagIds: tagList(t.tagIds, who),
      notes: t.notes ?? null,
      reference: t.reference ?? null,
      status: t.status,
      confirmed: t.confirmed !== false,
    };
    // The direction is the user's only for interest and adjustments (R4).
    if (t.kind === "interest" || t.personAction === "adjustment") fields.flow = t.flow;
    if (t.planItemId && t.planMonth && known.plan_item.has(String(t.planItemId))) {
      fields.planItemId = to(String(t.planItemId));
      fields.planMonth = t.planMonth;
    }
    if (t.warrantyUntil) {
      fields.warrantyUntil = t.warrantyUntil;
      fields.warrantyNote = t.warrantyNote ?? null;
      if (Number(t.warrantyDismissed ?? 0) > 0) fields.warrantyDismissed = Number(t.warrantyDismissed);
    }
    add(who, "transaction", to(t.id), "create", fields);
    if (t.generated === true && typeof t.interestMonth === "string") {
      interest.proposals.push({ transactionId: to(t.id), interestMonth: t.interestMonth, userEdited: t.userEdited === true });
    }
  }
  for (const d of backup.declinedInterest) {
    if (known.payee.has(d.payeeId)) interest.declined.push({ payeeId: to(d.payeeId), month: d.month });
  }
  // Archived accounts last: their transactions are created while they are active (R4).
  for (const a of r.account) if (a.state === "archived") add(`Account "${a.name}"`, "account", to(a.id), "archive");

  const attachments: RestoredAttachment[] = [];
  for (const a of r.attachment) {
    if (!known.transaction.has(String(a.transactionId))) {
      problem(`Attachment "${a.name}" refers to a transaction that is not in the backup.`);
      continue;
    }
    attachments.push({
      backupId: a.id,
      transactionId: to(String(a.transactionId)),
      name: String(a.name),
      contentType: String(a.contentType),
      sizeBytes: Number(a.sizeBytes),
    });
  }

  // Every change by the same shapes as a push (R4 rules, plan and template rules).
  changes.forEach((c, i) => {
    const parsed = Change.safeParse(c);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      problem(`${labels[i]}: ${issue?.message ?? "not valid"}.`);
    }
  });
  return { changes, interest, attachments, problems };
}

/** Changes in chunks for the import session (R10-05). */
export function chunked<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
