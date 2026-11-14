/**
 * Quick-add template rules (research R8-03 – R8-06): the visible list, "Save as template", what a
 * recording looks like, the amount box, references that went away, and the tie to a planned payment.
 * Pure: web and Android get the same answers (constitution VII).
 */
import { parseAmountInput, type AmountInputError } from "../money/parse";
import { monthName } from "../plan/months";
import { paysTarget } from "../plan/match";
import type { PlanMonthView, PlanRow } from "../plan/month";
import type { PlanItem } from "../plan/schemas";
import type { TransactionView } from "../transactions/types";
import type { TemplateView } from "./schemas";

/** Live, not hidden, in the user's order (then by name). */
export function visibleTemplates<T extends Pick<TemplateView, "state" | "hidden" | "sortKey" | "name">>(list: readonly T[]): T[] {
  return orderedTemplates(list).filter((t) => !t.hidden);
}

/** Live templates in the user's order (Manage templates shows hidden ones too). */
export function orderedTemplates<T extends Pick<TemplateView, "state" | "sortKey" | "name">>(list: readonly T[]): T[] {
  return list
    .filter((t) => t.state === "active")
    .sort((a, b) => (a.sortKey === b.sortKey ? a.name.localeCompare(b.name) : a.sortKey < b.sortKey ? -1 : 1));
}

/** "Fresh Mart", or "Fresh Mart (2)" when taken (names are unique ignoring case). */
export function freeTemplateName(wanted: string, taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  const base = [...wanted.trim()].slice(0, 40).join("") || "Template";
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = [...base].slice(0, 40 - suffix.length).join("").trimEnd() + suffix;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** A template draft from a recorded transaction (FR-003): no date, time, status, reference or plan link. */
export function templateFromTransaction(
  tx: TransactionView,
  takenNames: readonly string[],
  names: { payee: (id: string) => string | null },
): Omit<TemplateView, "id" | "sortKey" | "state"> | null {
  if (tx.kind === "interest" || tx.personAction === "adjustment" || !tx.accountId) return null;
  const fromPayee = tx.payeeId ? names.payee(tx.payeeId) : null;
  const fromNotes = tx.notes?.trim() ? tx.notes.trim().split("\n")[0]!.slice(0, 40) : null;
  return {
    name: freeTemplateName(fromPayee ?? fromNotes ?? "Template", takenNames),
    kind: tx.kind,
    flow: tx.flow,
    accountId: tx.accountId,
    toAccountId: tx.toAccountId,
    amountMinor: tx.amountMinor,
    payeeId: tx.payeeId,
    personAction: tx.personAction,
    categoryId: tx.categoryId,
    lines: tx.lines,
    tagIds: tx.tagIds,
    notes: tx.notes,
    planItemId: null,
    hidden: false,
  };
}

export type TemplateProblem = "account" | "toAccount" | "payee" | "category" | "tag";

/** What the template refers to that has been archived or deleted since (FR-011). Hidden ones are fine. */
export function templateProblems(
  t: Pick<TemplateView, "accountId" | "toAccountId" | "payeeId" | "categoryId" | "lines" | "tagIds">,
  live: { accounts: ReadonlySet<string>; payees: ReadonlySet<string>; categories: ReadonlySet<string>; tags: ReadonlySet<string> },
): TemplateProblem[] {
  const out: TemplateProblem[] = [];
  if (!live.accounts.has(t.accountId)) out.push("account");
  if (t.toAccountId && !live.accounts.has(t.toAccountId)) out.push("toAccount");
  if ((t.payeeId && !live.payees.has(t.payeeId)) || t.lines.some((l) => l.personId && !live.payees.has(l.personId))) out.push("payee");
  if ((t.categoryId && !live.categories.has(t.categoryId)) || t.lines.some((l) => l.categoryId && !live.categories.has(l.categoryId))) out.push("category");
  if ([...t.tagIds, ...t.lines.flatMap((l) => l.tagIds)].some((id) => !live.tags.has(id))) out.push("tag");
  return out;
}

/** Whether a template can pay a planned payment: the R7 rule (same payee, card or person, money out). */
export function templateFitsPlan(t: Pick<TemplateView, "kind" | "payeeId" | "toAccountId" | "personAction">, item: Pick<PlanItem, "target" | "payeeId" | "cardAccountId">): boolean {
  return paysTarget(item, { kind: t.kind, payeeId: t.payeeId, toAccountId: t.toAccountId, personAction: t.personAction });
}

export type TieOutcome =
  | { pays: PlanRow }
  | { pays: null; reason: "not_tied" | "gone" | "no_fit" | "nothing_left"; itemName: string | null };

/**
 * The item-month a tied template's recording pays (clarify Q1, R8-04): the oldest carried-over month of
 * that item with something left, else this month when something is left. `view` is the current month's.
 */
export function tiedPlanMonth(t: Pick<TemplateView, "kind" | "payeeId" | "toAccountId" | "personAction" | "planItemId">, item: PlanItem | undefined, view: Pick<PlanMonthView, "rows" | "carried">): TieOutcome {
  if (!t.planItemId) return { pays: null, reason: "not_tied", itemName: null };
  if (!item || item.state !== "active") return { pays: null, reason: "gone", itemName: item?.name ?? null };
  if (!templateFitsPlan(t, item)) return { pays: null, reason: "no_fit", itemName: item.name };
  const open = (r: PlanRow) => r.itemId === item.id && !r.removed && r.status !== "skipped" && r.leftMinor > 0n;
  const carried = view.carried.filter(open).sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  const row = carried[0] ?? view.rows.find(open) ?? null;
  return row ? { pays: row } : { pays: null, reason: "nothing_left", itemName: item.name };
}

/** The words after "Recorded …" about the planned payment. */
export function tieMessage(outcome: TieOutcome, currentMonth: string): string | null {
  if (outcome.pays) return `pays ${outcome.pays.name} (${monthName(outcome.pays.month)})`;
  switch (outcome.reason) {
    case "not_tied":
      return null;
    case "gone":
      return "not linked: that planned payment no longer exists";
    case "no_fit":
      return `not linked: the template no longer fits ${outcome.itemName}`;
    case "nothing_left":
      return `not linked: ${outcome.itemName} is already paid for ${monthName(currentMonth)}`;
  }
}

const AMOUNT_WORDS: Record<AmountInputError, string> = {
  NOT_A_NUMBER: "Enter an amount like 1,240.00.",
  TOO_MANY_DECIMALS: "Use at most two decimal places.",
  OUT_OF_RANGE: "That amount is too large.",
  NEGATIVE_NOT_ALLOWED: "Enter the amount without a minus sign.",
};

export type AmountBox = { ok: true; amountMinor: bigint } | { ok: false; message: string } | { ok: false; openForm: true };

/**
 * The amount box beside Record (clarify Q4): empty or invalid is refused; a split template's amount can
 * only change in the form, where its lines can be adjusted.
 */
export function readAmountBox(t: Pick<TemplateView, "amountMinor" | "lines">, text: string, currency: string): AmountBox {
  if (text.trim() === "") return { ok: false, message: "Enter the amount." };
  const parsed = parseAmountInput(text, { currency });
  if (!parsed.ok) return { ok: false, message: AMOUNT_WORDS[parsed.error] };
  if (parsed.minor <= 0n) return { ok: false, message: "Enter an amount greater than zero." };
  if (t.lines.length > 0 && parsed.minor !== t.amountMinor) return { ok: false, openForm: true };
  return { ok: true, amountMinor: parsed.minor };
}

/**
 * An ordinary R4 transaction from a template (R8-03): today, the amount from the box, and the planned
 * payment it pays when the template is tied. Split lines get fresh ids. The transaction keeps no
 * template id, so later template edits never change it (FR-006).
 */
export function recordFromTemplate(
  t: TemplateView,
  input: { amountMinor: bigint; today: string; pays: { itemId: string; month: string } | null; newId: () => string },
): Record<string, unknown> {
  return {
    kind: t.kind,
    date: input.today,
    timeOfDay: null,
    accountId: t.accountId,
    toAccountId: t.toAccountId,
    amountMinor: input.amountMinor.toString(),
    payeeId: t.payeeId,
    personAction: t.personAction,
    categoryId: t.lines.length > 0 ? null : t.categoryId,
    lines: t.lines.map((l) => ({
      id: input.newId(),
      amountMinor: l.amountMinor.toString(),
      categoryId: l.categoryId,
      personId: l.personId,
      personAction: l.personAction,
      notes: l.notes,
      tagIds: l.tagIds,
    })),
    tagIds: t.tagIds,
    notes: t.notes,
    reference: null,
    status: "uncleared",
    confirmed: true,
    planItemId: input.pays?.itemId ?? null,
    planMonth: input.pays?.month ?? null,
  };
}

/** The template's fields on the wire (create). */
export function templateToWire(t: Omit<TemplateView, "id" | "state" | "flow">): Record<string, unknown> {
  return {
    name: t.name,
    kind: t.kind,
    accountId: t.accountId,
    toAccountId: t.toAccountId,
    amountMinor: t.amountMinor === null ? null : t.amountMinor.toString(),
    payeeId: t.payeeId,
    personAction: t.personAction,
    categoryId: t.lines.length > 0 ? null : t.categoryId,
    lines: t.lines.map((l) => ({ ...l, amountMinor: l.amountMinor.toString() })),
    tagIds: t.tagIds,
    notes: t.notes,
    planItemId: t.planItemId,
    sortKey: t.sortKey,
    hidden: t.hidden,
  };
}
