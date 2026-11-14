"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import {
  canPayPlan,
  formatAmountInput,
  monthName,
  parseAmountInput,
  PERSON_ACTION_TEXT,
  PERSON_ACTIONS_IN,
  PERSON_ACTIONS_OUT,
  TRANSACTION_KIND_TEXT,
  TRANSACTION_STATUS_TEXT,
  TRANSACTION_STATUSES,
  TemplateCreateFields,
  templateFitsPlan,
  TransactionCreateFields,
  type AccountView,
  type AmountInputError,
  type CategoriesStart,
  type CategoryView,
  type ChangeInput,
  type MoneyFlow,
  type PayDraft,
  type PayeeView,
  type PlanItem,
  type TemplateView,
  type PersonAction,
  type TagView,
  type TransactionKind,
  type TransactionStatus,
  type TransactionView,
} from "@ft/core";
import { planSuggestions, type PlanSuggestion } from "@/app/(app)/payment-plan/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DateText } from "@/components/DateText";
import { Money } from "@/components/Money";
import { CategoryPicker } from "@/components/lists/CategoryPicker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changes, useSyncPush } from "@/lib/sync-client";
import { PayeeCombobox, type PayeeChoice } from "./PayeeCombobox";
import { emptyLine, linesTotal, SplitEditor, type SplitLineDraft } from "./SplitEditor";
import { TagPicker } from "./TagPicker";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

/** The types a user picks when adding; interest entries are added from the person's page (US4). */
const TABS = ["expense", "income", "refund", "transfer", "person"] as const;
type Tab = (typeof TABS)[number];

const AMOUNT_MESSAGES: Record<AmountInputError, string> = {
  NOT_A_NUMBER: "Enter an amount like 1,234.50.",
  TOO_MANY_DECIMALS: "Use at most two decimal places.",
  OUT_OF_RANGE: "The amount is too large. The most is ₹9,99,99,99,999.99.",
  NEGATIVE_NOT_ALLOWED: "Enter the amount without a minus sign; the type says which way the money moved.",
};

const REFUSALS: Record<string, string> = {
  DATE_BEFORE_OPENING: "This date is before the opening balance of the account or person. Change their opening date first.",
  ACCOUNT_INACTIVE: "That account is archived. Choose an active account.",
  INVALID_CATEGORY: "That category can't be used here. Choose a category of the right kind.",
  INVALID_PERSON: "Choose a person, not a business.",
  LINES_MISMATCH: "The split lines must add up to the amount.",
  NOT_FOUND: "This transaction no longer exists. It may have been deleted on another device.",
  NAME_TAKEN: "A payee or tag with that name already exists. Choose it from the list.",
  VALIDATION_FAILED: "Some details are not valid. Check them and try again.",
  INVALID_TEMPLATE: "Some details can't be used in a template. Check the accounts, payee, category and the planned payment it pays.",
  LIMIT_REACHED: "You already have 100 templates. Delete one you no longer use first.",
  INVALID_PLAN_LINK: "This transaction can't pay that planned payment. Choose None, or check the planned payment still exists.",
};

type Field = "account" | "toAccount" | "amount" | "date" | "payee" | "notes" | "reference" | "split" | "name";

/** A date problem that the user fixes elsewhere: the account's or person's opening date. */
interface OpeningProblem {
  /** The account's or person's name and opening date. */
  name: string;
  date: string;
  whose: "account" | "person";
  href: string;
}

export type TransactionFormMode =
  | { type: "create"; kind?: Tab | "interest"; accountId?: string | null; payeeId?: string | null; draft?: FormDraft }
  | { type: "edit"; transaction: TransactionView }
  /**
   * R8: make or edit a quick-add template with the same form. No date, time, status or reference; the
   * amount is optional; a name, and optionally the planned payment it pays.
   */
  | { type: "template"; template: TemplateView | null; seed?: FormDraft | null; seedName?: string; sortKey: string; takenNames: string[]; planItems: PlanItem[] };

/** Starting values for a new transaction: from Pay (R7) or from a template (R8, which adds lines and tags). */
export type FormDraft = Omit<PayDraft, "planItemId" | "planMonth" | "accountId" | "amountMinor"> & {
  accountId: string | null;
  amountMinor: bigint | null;
  lines?: TransactionView["lines"];
  tagIds?: string[];
};

/**
 * The planned payment this transaction pays (R7 US3): opened from Pay (`fixed`: it always links), or
 * the link an existing transaction already has (untick to unlink).
 */
export interface PlanLinkProp {
  itemId: string;
  month: string;
  name: string;
  fixed: boolean;
}

/** "Everyday Savings’", "Ravi Kumar’s" (contracts/client-transactions.md wording). */
const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);

const categoryKindOf =(kind: TransactionKind) => (kind === "income" ? "income" : "expense");
const isCategorised = (kind: TransactionKind) => kind === "expense" || kind === "income" || kind === "refund";

function lineDraft(l: TransactionView["lines"][number], currency: string): SplitLineDraft {
  return {
    id: l.id,
    amount: formatAmountInput(l.amountMinor, currency),
    share: l.personId ? "person" : "category",
    categoryId: l.categoryId,
    person: l.personId ? { type: "existing", id: l.personId } : null,
    notes: l.notes ?? "",
    tagIds: l.tagIds,
  };
}

/**
 * Add or edit a transaction (R4 US1–US3, US5; FR-001 – FR-006, FR-010 – FR-012, FR-020). Amounts are
 * parsed to exact paise; the server re-checks everything. A new payee or tag typed here is created
 * in the same push, before the transaction. Editing sends only what changed — the amount and the
 * split lines always together (R4-01).
 */
export function TransactionForm({
  mode,
  accounts,
  payees,
  categories,
  tags,
  categoriesStart,
  todayIso,
  currency,
  returnTo,
  planLink = null,
}: {
  planLink?: PlanLinkProp | null;
  mode: TransactionFormMode;
  accounts: AccountView[];
  payees: PayeeView[];
  categories: CategoryView[];
  tags: TagView[];
  categoriesStart: CategoriesStart | null;
  todayIso: string;
  currency: string;
  returnTo: string;
}) {
  const ids = useId();
  const router = useRouter();
  const push = useSyncPush();
  const saved = mode.type === "edit" ? mode.transaction : null;

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.state === "active").sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0)),
    [accounts],
  );
  const defaultAccount =
    (mode.type === "create" && activeAccounts.find((a) => a.id === mode.accountId)?.id) || activeAccounts[0]?.id || "";

  // Opened from Pay (R7 FR-010) or a template (R8): the form starts filled in. In template mode the
  // template itself (or "Save as template"'s transaction) is the starting point.
  const tpl = mode.type === "template" ? mode.template : null;
  const isTemplate = mode.type === "template";
  const draft: FormDraft | null =
    mode.type === "create"
      ? (mode.draft ?? null)
      : mode.type === "template"
        ? tpl
          ? { ...tpl, date: todayIso, notes: tpl.notes ?? "" }
          : (mode.seed ?? null)
        : null;
  const [kind, setKind] = useState<TransactionKind>(saved?.kind ?? draft?.kind ?? (mode.type === "create" ? (mode.kind ?? "expense") : "expense"));
  const [accountId, setAccountId] = useState(saved?.accountId ?? (draft?.accountId ?? (draft && !isTemplate ? "" : defaultAccount)));
  // R8 template fields.
  const [name, setName] = useState(tpl?.name ?? (mode.type === "template" ? (mode.seedName ?? "") : ""));
  const [tieId, setTieId] = useState<string>(tpl?.planItemId ?? "");
  const [toAccountId, setToAccountId] = useState(saved?.toAccountId ?? draft?.toAccountId ?? "");
  const [amount, setAmount] = useState(
    saved ? formatAmountInput(saved.amountMinor, currency) : draft?.amountMinor && draft.amountMinor > 0n ? formatAmountInput(draft.amountMinor, currency) : "",
  );
  const [date, setDate] = useState(saved?.date ?? todayIso);
  const [time, setTime] = useState(saved?.timeOfDay ?? "");
  const [payee, setPayee] = useState<PayeeChoice>(() => {
    if (saved?.payeeId) return { type: "existing", id: saved.payeeId };
    if (draft?.payeeId) return { type: "existing", id: draft.payeeId };
    if (mode.type === "create" && mode.payeeId) return { type: "existing", id: mode.payeeId };
    return null;
  });
  const [personAction, setPersonAction] = useState<PersonAction>(saved?.personAction ?? draft?.personAction ?? "lent");
  const [flow, setFlow] = useState<MoneyFlow>(saved?.flow ?? "out");
  const [categoryId, setCategoryId] = useState<string | null>(saved?.categoryId ?? draft?.categoryId ?? null);
  const [lines, setLines] = useState<SplitLineDraft[] | null>(() => {
    const from = saved?.lines ?? draft?.lines ?? [];
    // A template's lines get fresh ids: they become this transaction's own.
    return from.length > 0 ? from.map((l) => ({ ...lineDraft(l, currency), id: saved || tpl ? l.id : crypto.randomUUID() })) : null;
  });
  const [tagIds, setTagIds] = useState<string[]>(saved?.tagIds ?? draft?.tagIds ?? []);
  const [createdTags, setCreatedTags] = useState<TagView[]>([]);
  const [notes, setNotes] = useState(saved?.notes ?? draft?.notes ?? "");
  // R7 "Pays:" — the link is kept unless unticked; otherwise the first suggestion is ticked by default.
  const [keepLink, setKeepLink] = useState(true);
  const [suggested, setSuggested] = useState<{ key: string; list: PlanSuggestion[] } | null>(null);
  /** undefined: the default (first suggestion); null: None; else `item|month`. */
  const [paysChoice, setPaysChoice] = useState<string | null | undefined>(undefined);
  const [reference, setReference] = useState(saved?.reference ?? "");
  const [status, setStatus] = useState<TransactionStatus>(saved?.status ?? "uncleared");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState<OpeningProblem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const payeeById = useMemo(() => new Map(payees.map((p) => [p.id, p])), [payees]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const adjustment = kind === "person" && personAction === "adjustment";
  const usesAccount = kind !== "interest" && !adjustment;
  const ownFlow = adjustment || kind === "interest";
  const effectiveFlow: MoneyFlow =
    ownFlow ? flow : kind === "income" || kind === "refund" || (kind === "person" && (PERSON_ACTIONS_IN as readonly string[]).includes(personAction)) ? "in" : "out";
  const parsedAmount = parseAmountInput(amount, { currency });
  const amountMinor = parsedAmount.ok && parsedAmount.minor > 0n ? parsedAmount.minor : null;
  const upcoming = date > todayIso;
  const awaiting = saved !== null && !saved.confirmed && !upcoming;

  // R7 US3 8 (FR-013): what is being entered may pay an unpaid planned payment. Suggestions only:
  // the user can choose another or None. Asked for (debounced) when the details that matter change.
  const payable = canPayPlan(kind, kind === "person" ? personAction : null);
  const suggestKey =
    !isTemplate && !planLink && payable && amountMinor !== null && date
      ? JSON.stringify({
          kind,
          toAccountId: kind === "transfer" && toAccountId ? toAccountId : null,
          payeeId: kind !== "transfer" && payee?.type === "existing" ? payee.id : null,
          personAction: kind === "person" ? personAction : null,
          amountMinor: amountMinor.toString(),
          date,
        })
      : null;
  useEffect(() => {
    if (!suggestKey) return;
    let current = true;
    const timer = setTimeout(() => {
      void planSuggestions(JSON.parse(suggestKey)).then((list) => {
        if (current) setSuggested({ key: suggestKey, list });
      });
    }, 400);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [suggestKey]);
  const suggestions = suggested && suggested.key === suggestKey ? suggested.list : [];
  const suggestionKey = (s: PlanSuggestion) => `${s.itemId}|${s.month}`;
  const chosenSuggestion = paysChoice === null ? null : (suggestions.find((s) => suggestionKey(s) === paysChoice) ?? suggestions[0] ?? null);
  /** The item-month this transaction will pay when saved, or null. */
  const paying: { itemId: string; month: string } | null = !payable
    ? null
    : planLink
      ? planLink.fixed || keepLink
        ? { itemId: planLink.itemId, month: planLink.month }
        : null
      : chosenSuggestion
        ? { itemId: chosenSuggestion.itemId, month: chosenSuggestion.month }
        : null;
  const unpaying = saved !== null && planLink !== null && !planLink.fixed;

  // R8: the planned payments this template could pay, as it is filled in now (R7's rule).
  const tieShape = {
    kind: kind as TemplateView["kind"],
    payeeId: kind !== "transfer" && payee?.type === "existing" ? payee.id : null,
    toAccountId: kind === "transfer" ? toAccountId || null : null,
    personAction: kind === "person" ? (personAction as TemplateView["personAction"]) : null,
  };
  const tieOptions = mode.type === "template" ? mode.planItems.filter((i) => i.state === "active" && templateFitsPlan(tieShape, i)) : [];
  const tie = tieOptions.some((i) => i.id === tieId) ? tieId : "";

  /** Accounts offered: active ones, plus the one already used (FR-006). */
  const accountOptions = (current: string) => {
    const list = [...activeAccounts];
    const used = accountById.get(current);
    if (used && used.state !== "active") list.push(used);
    return list;
  };

  function changeKind(next: Tab) {
    if (categoryKindOf(next) !== categoryKindOf(kind)) {
      setCategoryId(null);
      setLines(null);
    }
    if (next === "person" && payee?.type === "existing" && payeeById.get(payee.id)?.kind !== "person") setPayee(null);
    setKind(next);
  }

  function choosePayee(choice: PayeeChoice) {
    setPayee(choice);
    // The payee's default category fills an empty category (FR-005).
    if (choice?.type === "existing" && isCategorised(kind) && categoryId === null && lines === null) {
      const def = payeeById.get(choice.id)?.defaultCategoryId;
      if (def && categoryById.get(def)?.kind === categoryKindOf(kind)) setCategoryId(def);
    }
  }

  function startSplit() {
    setLines([{ ...emptyLine(), amount, categoryId }, emptyLine()]);
    setCategoryId(null);
  }

  function unsplit() {
    const first = lines?.find((l) => l.share === "category");
    setCategoryId(first?.categoryId ?? null);
    setLines(null);
  }

  /** A new person gets an opening date no later than the transaction, so it can be recorded. */
  const personOpening = date && date < todayIso ? date : todayIso;
  const newPayeeChange = (choice: { name: string; kind: "business" | "person" }, id: string) =>
    changes.createPayee(id, choice.kind === "person" ? { name: choice.name, kind: "person", openingBalanceDate: personOpening } : { name: choice.name, kind: "business" });

  function build(): { fields: Record<string, unknown>; before: ChangeInput[] } | null {
    const next: Partial<Record<Field, string>> = {};
    const nextLines: Record<string, string> = {};
    let problem: OpeningProblem | null = null;
    const before: ChangeInput[] = [];

    if (isTemplate) {
      const trimmed = name.trim();
      if (trimmed === "") next.name = "Give the template a short name, like Milk or Fuel.";
      else if ([...trimmed].length > 40) next.name = "Use at most 40 characters.";
      else if (mode.type === "template" && mode.takenNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) next.name = "You already have a template with this name.";
    }
    // A template may leave the amount empty ("amount each time"), unless it is split.
    if (amount.trim() === "") {
      if (!isTemplate || lines) next.amount = isTemplate ? "A split template needs its amount." : "Enter the amount.";
    } else if (!parsedAmount.ok) next.amount = AMOUNT_MESSAGES[parsedAmount.error];
    else if (parsedAmount.minor <= 0n) next.amount = "Enter an amount greater than zero.";
    if (!date && !isTemplate) next.date = "Choose a date.";

    const account = usesAccount ? accountById.get(accountId) : undefined;
    if (usesAccount && !account) next.account = "Choose an account.";
    const toAccount = kind === "transfer" ? accountById.get(toAccountId) : undefined;
    if (kind === "transfer") {
      if (!toAccount) next.toAccount = "Choose the account the money went to.";
      else if (toAccountId === accountId) next.toAccount = "Choose two different accounts.";
    }
    // Dates before an opening balance are refused, with a link to change it (FR-002, owner 2026-10-31).
    for (const a of isTemplate ? [] : [account, toAccount]) {
      if (a && date && date < a.openingBalanceDate && !problem) {
        problem = { name: a.name, date: a.openingBalanceDate, whose: "account", href: `/accounts/${a.id}` };
      }
    }

    let payeeId: string | null = null;
    if (kind !== "transfer" && payee) {
      if (payee.type === "existing") payeeId = payee.id;
      else {
        payeeId = crypto.randomUUID();
        before.push(newPayeeChange(payee, payeeId));
      }
    }
    if ((kind === "person" || kind === "interest") && !payeeId) next.payee = "Choose the person.";
    const person = payee?.type === "existing" ? payeeById.get(payee.id) : undefined;
    if (!isTemplate && (kind === "person" || kind === "interest") && person?.openingBalanceDate && date && date < person.openingBalanceDate && !problem) {
      problem = { name: person.name, date: person.openingBalanceDate, whose: "person", href: `/people/${person.id}` };
    }

    if (adjustment && notes.trim() === "") next.notes = "Give a reason for the adjustment.";
    if ([...notes].length > 1000) next.notes = "Use at most 1,000 characters.";
    if ([...reference.trim()].length > 40) next.reference = "Use at most 40 characters.";

    let wireLines: Record<string, unknown>[] = [];
    if (lines && isCategorised(kind)) {
      for (const line of lines) {
        const parsed = parseAmountInput(line.amount, { currency });
        if (!parsed.ok) nextLines[line.id] = line.amount.trim() === "" ? "Enter this line's amount." : AMOUNT_MESSAGES[parsed.error];
        else if (parsed.minor <= 0n) nextLines[line.id] = "Enter an amount greater than zero.";
        else if (line.share === "person" && !line.person) nextLines[line.id] = "Choose the person.";
      }
      if (amountMinor !== null && linesTotal(lines, currency) !== amountMinor) next.split = "The lines must add up to the amount before you save.";
      wireLines = lines.map((line) => {
        let personId: string | null = null;
        if (line.share === "person" && line.person) {
          if (line.person.type === "existing") personId = line.person.id;
          else {
            personId = crypto.randomUUID();
            before.push(newPayeeChange(line.person, personId));
          }
        }
        const parsed = parseAmountInput(line.amount, { currency });
        return {
          id: line.id,
          amountMinor: parsed.ok ? parsed.minor.toString() : "0",
          categoryId: line.share === "category" ? line.categoryId : null,
          personId,
          personAction: personId ? (effectiveFlow === "out" ? "paid_on_behalf" : "collected_on_behalf") : null,
          notes: line.notes.trim() === "" ? null : line.notes,
          tagIds: line.tagIds,
        };
      });
    }

    setErrors(next);
    setLineErrors(nextLines);
    setOpening(problem);
    if (Object.keys(next).length > 0 || Object.keys(nextLines).length > 0 || problem) return null;

    // Tags created here are saved first; only those still chosen somewhere.
    const used = new Set([...tagIds, ...wireLines.flatMap((l) => l.tagIds as string[])]);
    for (const t of createdTags) if (used.has(t.id)) before.unshift(changes.createTag(t.id, t.name));

    if (isTemplate && mode.type === "template") {
      const tplFields: Record<string, unknown> = {
        name: name.trim(),
        accountId,
        toAccountId: kind === "transfer" ? toAccountId : null,
        amountMinor: amountMinor === null ? null : amountMinor.toString(),
        payeeId: kind === "transfer" ? null : payeeId,
        personAction: kind === "person" ? personAction : null,
        categoryId: isCategorised(kind) && !lines ? categoryId : null,
        lines: wireLines,
        tagIds,
        notes: notes.trim() === "" ? null : notes,
        planItemId: tie || null,
      };
      const check = TemplateCreateFields.safeParse({ ...tplFields, kind, sortKey: tpl?.sortKey ?? mode.sortKey });
      if (!check.success) {
        setFormError(check.error.issues[0]?.message ?? REFUSALS.VALIDATION_FAILED!);
        return null;
      }
      return { fields: tplFields, before };
    }

    const fields: Record<string, unknown> = {
      date,
      timeOfDay: time === "" ? null : time,
      accountId: usesAccount ? accountId : null,
      toAccountId: kind === "transfer" ? toAccountId : null,
      amountMinor: amountMinor!.toString(),
      payeeId: kind === "transfer" ? null : payeeId,
      personAction: kind === "person" ? personAction : null,
      categoryId: isCategorised(kind) && !lines ? categoryId : null,
      lines: wireLines,
      tagIds,
      notes: notes.trim() === "" ? null : notes,
      reference: reference.trim() === "" ? null : reference.trim(),
      status,
    };
    if (ownFlow) fields.flow = flow;
    // The two link fields always travel together (R7-03).
    fields.planItemId = paying?.itemId ?? null;
    fields.planMonth = paying?.month ?? null;
    const check = TransactionCreateFields.safeParse({ ...fields, kind });
    if (!check.success) {
      setFormError(check.error.issues[0]?.message ?? REFUSALS.VALIDATION_FAILED!);
      return null;
    }
    return { fields, before };
  }

  /** What differs from the saved transaction; the amount and lines travel together (R4-01). */
  function changed(fields: Record<string, unknown>, tx: TransactionView): Record<string, unknown> {
    const wireLine = (l: TransactionView["lines"][number]) => ({
      id: l.id,
      amountMinor: l.amountMinor.toString(),
      categoryId: l.categoryId,
      personId: l.personId,
      personAction: l.personAction,
      notes: l.notes,
      tagIds: l.tagIds,
    });
    const original: Record<string, unknown> = {
      date: tx.date,
      timeOfDay: tx.timeOfDay,
      accountId: tx.accountId,
      toAccountId: tx.toAccountId,
      amountMinor: tx.amountMinor.toString(),
      payeeId: tx.payeeId,
      personAction: tx.personAction,
      flow: tx.flow,
      categoryId: tx.categoryId,
      lines: tx.lines.map(wireLine),
      tagIds: tx.tagIds,
      notes: tx.notes,
      reference: tx.reference,
      status: tx.status,
      planItemId: tx.planItemId,
      planMonth: tx.planMonth,
    };
    const diff = Object.fromEntries(
      Object.entries(fields).filter(([key, value]) => JSON.stringify(original[key]) !== JSON.stringify(value)),
    );
    if ("amountMinor" in diff || "lines" in diff) {
      diff.amountMinor = fields.amountMinor;
      diff.lines = fields.lines;
    }
    if ("planItemId" in diff || "planMonth" in diff) {
      diff.planItemId = fields.planItemId;
      diff.planMonth = fields.planMonth;
    }
    return diff;
  }

  async function save(confirmNow: boolean) {
    setFormError(null);
    const built = build();
    if (!built) return;
    let change: ChangeInput;
    if (mode.type === "template") {
      if (!mode.template) {
        change = changes.createTemplate(crypto.randomUUID(), { ...built.fields, kind, sortKey: mode.sortKey });
      } else {
        const t = mode.template;
        const original: Record<string, unknown> = {
          name: t.name,
          accountId: t.accountId,
          toAccountId: t.toAccountId,
          amountMinor: t.amountMinor === null ? null : t.amountMinor.toString(),
          payeeId: t.payeeId,
          personAction: t.personAction,
          categoryId: t.categoryId,
          lines: t.lines.map((l) => ({ ...l, amountMinor: l.amountMinor.toString() })),
          tagIds: t.tagIds,
          notes: t.notes,
          planItemId: t.planItemId,
        };
        const diff = Object.fromEntries(Object.entries(built.fields).filter(([k, v]) => JSON.stringify(original[k]) !== JSON.stringify(v)));
        if ("amountMinor" in diff || "lines" in diff) {
          diff.amountMinor = built.fields.amountMinor;
          diff.lines = built.fields.lines;
        }
        if (Object.keys(diff).length === 0 && built.before.length === 0) return router.push(returnTo);
        change = changes.updateTemplate(t.id, diff);
      }
    } else if (mode.type === "create") {
      change = changes.createTransaction(crypto.randomUUID(), { ...built.fields, kind, confirmed: !upcoming });
    } else {
      const diff = changed(built.fields, mode.transaction);
      if (confirmNow) diff.confirmed = true;
      if (Object.keys(diff).length === 0 && built.before.length === 0) return router.push(returnTo);
      change = changes.updateTransaction(mode.transaction.id, diff);
    }
    const list = [...built.before, change];
    setBusy(true);
    const outcome = await push(list);
    setBusy(false);
    if (!outcome.ok) {
      setFormError(outcome.error.code === "NETWORK" ? "You appear to be offline. Please try again." : outcome.error.message);
      return;
    }
    const rejected = outcome.results.find((r) => r.status === "rejected");
    if (!rejected) return router.push(returnTo);
    // Whatever was created before the refusal now exists: choose it rather than add it again.
    list.forEach((c, i) => {
      if (outcome.results[i]?.status === "rejected") return;
      if (c.entity === "payee" && payee?.type === "new" && c.fields?.name === payee.name) setPayee({ type: "existing", id: c.entityId });
      if (c.entity === "tag") setCreatedTags((ts) => ts.filter((t) => t.id !== c.entityId));
    });
    setFormError((rejected.code && REFUSALS[rejected.code]) || "The transaction could not be saved. Check the details and try again.");
  }

  async function remove() {
    if (mode.type !== "edit" && !(mode.type === "template" && mode.template)) return;
    setBusy(true);
    const outcome = await push([
      mode.type === "edit" ? changes.deleteTransaction(mode.transaction.id) : changes.deleteTemplate((mode as { template: TemplateView }).template.id),
    ]);
    setBusy(false);
    setConfirmDelete(false);
    if (!outcome.ok) return setFormError(outcome.error.message);
    const result = outcome.results[0];
    if (result?.status === "rejected") return setFormError((result.code && REFUSALS[result.code]) || "It could not be deleted.");
    router.push(returnTo);
  }

  const err = (field: Field) =>
    errors[field] ? (
      <p id={`${ids}-${field}-error`} className="text-sm text-red-700 dark:text-red-300">
        {errors[field]}
      </p>
    ) : null;
  const describedBy = (field: Field, hint?: string) => [hint, errors[field] ? `${ids}-${field}-error` : null].filter(Boolean).join(" ") || undefined;

  const accountSelect = (field: "account" | "toAccount", labelText: string, value: string, onChange: (v: string) => void) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${ids}-${field}`}>{labelText}</Label>
      <select
        id={`${ids}-${field}`}
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!errors[field] || undefined}
        aria-describedby={describedBy(field)}
      >
        {field === "toAccount" && <option value="">Choose an account</option>}
        {accountOptions(value).map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.state !== "active" ? " (archived)" : ""}
          </option>
        ))}
      </select>
      {err(field)}
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      noValidate
      className="flex max-w-xl flex-col gap-5"
    >
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {opening && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            This date is before {possessive(opening.name)} opening balance of <DateText date={opening.date} />.{" "}
            {opening.whose === "account" ? "Change the account's opening date first." : "Change their opening date first."}{" "}
            <Link href={opening.href} className="font-medium underline">
              Change {possessive(opening.name)} opening date
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {activeAccounts.length === 0 && mode.type === "create" && (
        <Alert role="status">
          <AlertDescription>
            Add an account first: every transaction moves money in or out of one.{" "}
            <Link href="/accounts/new" className="font-medium underline">
              Add account
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {isTemplate && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-name`}>Template name</Label>
          <Input
            id={`${ids}-name`}
            value={name}
            maxLength={40}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name || undefined}
            aria-describedby={describedBy("name")}
          />
          {err("name")}
        </div>
      )}

      {((mode.type === "create" && kind !== "interest" && !planLink?.fixed) || (mode.type === "template" && !mode.template)) ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Type</legend>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
            {TABS.map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
                  kind === t ? "bg-brand/15 font-semibold text-brand-strong dark:text-brand" : "hover:bg-muted"
                }`}
              >
                <input type="radio" name={`${ids}-kind`} value={t} checked={kind === t} onChange={() => changeKind(t)} className="sr-only" />
                {TRANSACTION_KIND_TEXT[t]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">
          Type: <span className="font-medium text-foreground">{TRANSACTION_KIND_TEXT[kind]}</span>
          {saved?.generated && saved.interestMonth && (
            <>
              {" "}
              · proposed automatically for the month of <DateText date={saved.interestMonth} />
            </>
          )}
          .{saved && " To change the type, delete this one and add it again."}
        </p>
      )}

      {planLink?.fixed && (
        <p id="pays-plan" className="rounded-md border border-border bg-muted p-2 text-sm">
          Pays: <span className="font-medium">{planLink.name}</span> ({monthName(planLink.month)}). Saving records the payment and marks it paid.
        </p>
      )}

      {awaiting && (
        <Alert role="status">
          <AlertDescription>This transaction is waiting for you to confirm it. It counts in balances once confirmed.</AlertDescription>
        </Alert>
      )}

      {kind === "person" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-action`}>What happened</Label>
          <select id={`${ids}-action`} className={selectClass} value={personAction} onChange={(e) => setPersonAction(e.target.value as PersonAction)}>
            <optgroup label="Money out of your account">
              {PERSON_ACTIONS_OUT.map((a) => (
                <option key={a} value={a}>
                  {PERSON_ACTION_TEXT[a]}
                </option>
              ))}
            </optgroup>
            <optgroup label="Money into your account">
              {PERSON_ACTIONS_IN.map((a) => (
                <option key={a} value={a}>
                  {PERSON_ACTION_TEXT[a]}
                </option>
              ))}
            </optgroup>
            {!isTemplate && (
              <optgroup label="No money moved">
                <option value="adjustment">{PERSON_ACTION_TEXT.adjustment}</option>
              </optgroup>
            )}
          </select>
        </div>
      )}

      {(kind === "person" || kind === "interest") && (
        <div className="flex flex-col gap-1.5">
          <PayeeCombobox
            label="Person"
            payees={payees}
            value={payee}
            onChange={setPayee}
            onlyPeople
            invalid={!!errors.payee}
            describedBy={describedBy("payee")}
          />
          {err("payee")}
        </div>
      )}

      {ownFlow && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{kind === "interest" ? "Interest" : "Direction"}</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" name={`${ids}-flow`} checked={flow === "out"} onChange={() => setFlow("out")} />
              {kind === "interest" ? "They owe me interest" : "They owe me more"}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name={`${ids}-flow`} checked={flow === "in"} onChange={() => setFlow("in")} />
              {kind === "interest" ? "I owe them interest" : "I owe them more"}
            </label>
          </div>
        </fieldset>
      )}

      {usesAccount &&
        accountSelect("account", kind === "transfer" ? "From account" : kind === "expense" || (kind === "person" && effectiveFlow === "out") ? "Paid from" : "Into account", accountId, setAccountId)}
      {kind === "transfer" && accountSelect("toAccount", "To account", toAccountId, setToAccountId)}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-amount`}>{isTemplate ? "Usual amount (optional)" : "Amount"}</Label>
        <Input
          id={`${ids}-amount`}
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          placeholder="0.00"
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={!!errors.amount || undefined}
          aria-describedby={describedBy("amount", isTemplate ? `${ids}-amount-hint` : undefined)}
        />
        {isTemplate && (
          <p id={`${ids}-amount-hint`} className="text-sm text-muted-foreground">
            With an amount, Record uses it in one tap. Leave it empty for something that costs a different amount each time.
          </p>
        )}
        {err("amount")}
      </div>

      {!isTemplate && (
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-date`}>Date</Label>
          <Input
            id={`${ids}-date`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!!errors.date || !!opening || undefined}
            aria-describedby={describedBy("date", upcoming ? `${ids}-upcoming` : undefined)}
          />
          {err("date")}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-time`}>Time (optional)</Label>
          <Input id={`${ids}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      )}
      {upcoming && !isTemplate && (
        <p id={`${ids}-upcoming`} className="-mt-3 text-sm text-muted-foreground">
          Upcoming: it won&rsquo;t change any balance yet. On <DateText date={date} /> it waits in &ldquo;To confirm&rdquo;, and counts once you
          confirm it.
        </p>
      )}

      {isCategorised(kind) && (
        <>
          <PayeeCombobox label="Payee (optional)" payees={payees} value={payee} onChange={choosePayee} noneLabel="No payee" />
          {lines === null ? (
            <div className="flex flex-col gap-2">
              <CategoryPicker
                label="Category"
                categories={categories}
                value={categoryId}
                onChange={setCategoryId}
                kind={categoryKindOf(kind)}
                categoriesStart={categoriesStart}
                noneLabel="Uncategorised"
              />
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={startSplit}>
                Split into lines
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <SplitEditor
                lines={lines}
                onChange={setLines}
                totalMinor={amountMinor}
                categoryKind={categoryKindOf(kind)}
                flow={effectiveFlow}
                categories={categories}
                categoriesStart={categoriesStart}
                payees={payees}
                tags={tags}
                createdTags={createdTags}
                onCreatedTags={setCreatedTags}
                currency={currency}
                lineErrors={lineErrors}
                onUnsplit={unsplit}
              />
              {err("split")}
            </div>
          )}
        </>
      )}

      <TagPicker
        label="Tags (optional)"
        tags={tags}
        value={tagIds}
        created={createdTags}
        onChange={(next, created) => {
          setTagIds(next);
          setCreatedTags(created);
        }}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-notes`}>{adjustment ? "Reason" : "Notes (optional)"}</Label>
        <textarea
          id={`${ids}-notes`}
          value={notes}
          maxLength={1000}
          rows={2}
          onChange={(e) => setNotes(e.target.value)}
          aria-invalid={!!errors.notes || undefined}
          aria-describedby={describedBy("notes")}
          className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
        />
        {err("notes")}
      </div>

      {isTemplate && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-tie`}>Pays a planned payment (optional)</Label>
          <select id={`${ids}-tie`} className={selectClass} value={tie} onChange={(e) => setTieId(e.target.value)} aria-describedby={`${ids}-tie-hint`}>
            <option value="">None</option>
            {tieOptions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <p id={`${ids}-tie-hint`} className="text-sm text-muted-foreground">
            {tieOptions.length === 0
              ? "No planned payment is paid this way. Choose the same payee, card or person as a planned payment to tie them."
              : "Each recording then pays that planned payment's oldest unpaid month."}
          </p>
        </div>
      )}

      {!isTemplate && (
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-reference`}>Reference no. (optional)</Label>
          <Input
            id={`${ids}-reference`}
            value={reference}
            maxLength={40}
            autoComplete="off"
            onChange={(e) => setReference(e.target.value)}
            aria-invalid={!!errors.reference || undefined}
            aria-describedby={describedBy("reference")}
          />
          {err("reference")}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-status`}>Status</Label>
          <select id={`${ids}-status`} className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as TransactionStatus)}>
            {TRANSACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TRANSACTION_STATUS_TEXT[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      )}

      {unpaying && planLink && (
        <div className="flex flex-col gap-1 rounded-md border border-border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={keepLink} onChange={(e) => setKeepLink(e.target.checked)} />
            Pays: {planLink.name} ({monthName(planLink.month)})
          </label>
          <p className="text-sm text-muted-foreground">
            {keepLink ? "Untick to unlink it: the planned payment is then no longer paid by this transaction." : "It will be unlinked when you save. The transaction itself does not change."}
          </p>
          {keepLink && status === "void" && saved?.status !== "void" && (
            <p role="status" className="text-sm font-medium">
              Voiding this transaction makes {planLink.name} ({monthName(planLink.month)}) unpaid again.
            </p>
          )}
        </div>
      )}

      {!planLink && suggestions.length > 0 && (
        <fieldset className="flex flex-col gap-1 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">Pays a planned payment?</legend>
          {suggestions.map((s) => (
            <label key={suggestionKey(s)} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${ids}-pays`}
                checked={chosenSuggestion !== null && suggestionKey(chosenSuggestion) === suggestionKey(s)}
                onChange={() => setPaysChoice(suggestionKey(s))}
              />
              <span>
                Pays: {s.name} ({s.monthLabel}) · <Money value={BigInt(s.leftMinor)} currency={currency} /> left
              </span>
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name={`${ids}-pays`} checked={chosenSuggestion === null} onChange={() => setPaysChoice(null)} />
            None
          </label>
        </fieldset>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          Save
        </Button>
        {awaiting && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void save(true)}>
            Save and confirm
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => router.push(returnTo)}>
          Cancel
        </Button>
        {(mode.type === "edit" || (mode.type === "template" && mode.template)) && (
          <Button type="button" variant="destructive" className="ml-auto" disabled={busy} onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </div>

      {confirmDelete && isTemplate && (
        <ConfirmDialog title="Delete this template?" confirmLabel="Delete" destructive busy={busy} onConfirm={() => void remove()} onCancel={() => setConfirmDelete(false)}>
          It leaves the quick-add list for good. Transactions recorded from it do not change. To keep it but take it off the list,
          hide it instead.
        </ConfirmDialog>
      )}
      {confirmDelete && !isTemplate && (
        <ConfirmDialog title="Delete this transaction?" confirmLabel="Delete" destructive busy={busy} onConfirm={() => void remove()} onCancel={() => setConfirmDelete(false)}>
          It leaves every balance and total. Its history is kept.
          {unpaying && planLink && ` It pays ${planLink.name} (${monthName(planLink.month)}): that planned payment will no longer count it as paid.`}
        </ConfirmDialog>
      )}
    </form>
  );
}
