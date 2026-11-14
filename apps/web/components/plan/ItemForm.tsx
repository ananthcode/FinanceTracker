"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import {
  editTerms,
  formatAmountInput,
  intervalFor,
  moveStart,
  parseAmountInput,
  PERSON_ACTION_TEXT,
  PLAN_PERSON_ACTIONS,
  PlanItemCreateFields,
  PlanRuleError,
  termFor,
  termsToWire,
  type AccountView,
  type CategoriesStart,
  type CategoryView,
  type Month,
  type PayeeView,
  type PlanFrequency,
  type PlanItem,
  type PlanPersonAction,
  type PlanTarget,
  type PlanTerm,
} from "@ft/core";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CategoryPicker } from "@/components/lists/CategoryPicker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changes, useSyncPush } from "@/lib/sync-client";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

const FREQUENCY_TEXT: Record<PlanFrequency, string> = {
  monthly: "Every month",
  every_n_months: "Every few months",
  yearly: "Every year",
  one_off: "Once (this month only)",
};

const TARGET_TEXT: Record<PlanTarget, string> = {
  payee: "A payee",
  card: "A credit card bill",
  person: "A person",
};

const REFUSALS: Record<string, string> = {
  TERMS_IN_PAST: "Changes can apply only from the current month onward. Earlier months keep what they showed.",
  HAS_PAYMENTS: "Some months of this payment are already paid. Keep those months in its start, end and frequency.",
  INVALID_PLAN_ITEM: "Some details can't be used: check the payee, category, card and account (a card bill is not paid from the card itself).",
  NOT_FOUND: "This planned payment no longer exists. It may have been deleted on another device.",
  VALIDATION_FAILED: "Some details are not valid. Check them and try again.",
};

type Field = "name" | "payee" | "card" | "amount" | "dueDay" | "account" | "everyN" | "start" | "end" | "applyFrom" | "notes";

const toParam = (m: Month) => m.slice(0, 7);
const fromParam = (v: string): Month | null => (/^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? `${v}-01` : null);

/**
 * Add or edit a planned payment (R7 US2; FR-005 – FR-008; contracts/client-plan.md). A new item starts
 * in the month being viewed. On edit, changes to the amount, due day or account apply from the
 * "Apply from" month (default the month being viewed, never earlier than the current month); earlier
 * months keep what they showed. Only changed fields are sent.
 */
export function ItemForm({
  item,
  viewedMonth,
  currentMonth,
  accounts,
  payees,
  categories,
  categoriesStart,
  currency,
  paidMonths,
}: {
  item: PlanItem | null;
  viewedMonth: Month;
  currentMonth: Month;
  accounts: AccountView[];
  payees: PayeeView[];
  categories: CategoryView[];
  categoriesStart: CategoriesStart | null;
  currency: string;
  /** How many months of this item have payments (delete warning, FR-008). */
  paidMonths: number;
}) {
  const ids = useId();
  const router = useRouter();
  const push = useSyncPush();
  const term = item ? termFor(item, viewedMonth < item.startMonth ? item.startMonth : viewedMonth) : null;

  const activeAccounts = useMemo(() => accounts.filter((a) => a.state === "active"), [accounts]);
  const cards = activeAccounts.filter((a) => a.type === "credit_card");
  const businesses = payees.filter((p) => p.kind === "business" && !p.hidden);
  const people = payees.filter((p) => p.kind === "person");

  const [name, setName] = useState(item?.name ?? "");
  const [target, setTarget] = useState<PlanTarget>(item?.target ?? "payee");
  const [payeeId, setPayeeId] = useState(item?.payeeId ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(item?.categoryId ?? null);
  const [cardId, setCardId] = useState(item?.cardAccountId ?? cards[0]?.id ?? "");
  const [personAction, setPersonAction] = useState<PlanPersonAction>(item?.personAction ?? "repaid_to");
  const [amount, setAmount] = useState(term?.amountMinor != null ? formatAmountInput(term.amountMinor, currency) : "");
  const [varies, setVaries] = useState(item?.amountVaries ?? false);
  const [dueDay, setDueDay] = useState(String(term?.dueDay ?? 1));
  const [accountId, setAccountId] = useState(term?.accountId ?? activeAccounts.find((a) => a.type !== "credit_card")?.id ?? "");
  const [frequency, setFrequency] = useState<PlanFrequency>(item?.frequency ?? "monthly");
  const [everyN, setEveryN] = useState(String(item?.frequency === "every_n_months" ? item.intervalMonths : 3));
  const [start, setStart] = useState(toParam(item?.startMonth ?? viewedMonth));
  const [end, setEnd] = useState(item?.endMonth && item.frequency !== "one_off" ? toParam(item.endMonth) : "");
  const [applyFrom, setApplyFrom] = useState(toParam(viewedMonth < currentMonth ? currentMonth : viewedMonth));
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const returnTo = `/payment-plan?month=${toParam(viewedMonth)}`;
  const accountChoices = activeAccounts.filter((a) => !(target === "card" && a.id === cardId));
  if (term && !accountChoices.some((a) => a.id === term.accountId)) {
    const used = accounts.find((a) => a.id === term.accountId);
    if (used) accountChoices.push(used);
  }

  /** The fields as they would be stored, or null with the problems shown. */
  function build() {
    const next: Partial<Record<Field, string>> = {};
    if (name.trim() === "") next.name = "Enter a name, like Rent or Home loan EMI.";
    else if ([...name.trim()].length > 60) next.name = "Use at most 60 characters.";
    if ((target === "payee" || target === "person") && !payeeId) next.payee = target === "person" ? "Choose the person." : "Choose who it is paid to.";
    if (target === "card" && !cardId) next.card = "Choose the credit card.";
    let amountMinor: bigint | null = null;
    if (amount.trim() !== "") {
      const parsed = parseAmountInput(amount, { currency });
      if (!parsed.ok || parsed.minor <= 0n) next.amount = "Enter an amount greater than zero, like 25,000.00.";
      else amountMinor = parsed.minor;
    } else if (target !== "card" && !varies) next.amount = "Enter the amount, or tick “Amount varies”.";
    const day = Number(dueDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) next.dueDay = "Enter a day from 1 to 31.";
    if (!accountId) next.account = "Choose the account it is paid from.";
    const n = Number(everyN);
    if (frequency === "every_n_months" && (!Number.isInteger(n) || n < 2 || n > 12)) next.everyN = "Enter a number of months from 2 to 12.";
    const startMonth = fromParam(start);
    if (!startMonth) next.start = "Choose the month it starts.";
    const endMonth = frequency === "one_off" ? startMonth : end === "" ? null : fromParam(end);
    if (frequency !== "one_off" && end !== "" && !endMonth) next.end = "Choose a month, or leave it empty.";
    if (startMonth && endMonth && endMonth < startMonth) next.end = "The last month can't be before the first.";
    const from = fromParam(applyFrom);
    if (item && (!from || from < currentMonth)) next.applyFrom = "Changes apply from this month or a later one.";
    if ([...notes].length > 500) next.notes = "Use at most 500 characters.";
    setErrors(next);
    if (Object.keys(next).length > 0) return null;
    return {
      startMonth: startMonth!,
      endMonth,
      from: from ?? startMonth!,
      values: { amountMinor, dueDay: day, accountId },
      interval: intervalFor(frequency, n),
    };
  }

  async function save() {
    setFormError(null);
    const built = build();
    if (!built) return;
    const common = {
      name: name.trim(),
      payeeId: target === "card" ? null : payeeId,
      categoryId: target === "payee" ? categoryId : null,
      cardAccountId: target === "card" ? cardId : null,
      personAction: target === "person" ? personAction : null,
      amountVaries: varies,
      notes: notes.trim() === "" ? null : notes,
    };
    let change;
    if (!item) {
      const fields = {
        ...common,
        target,
        frequency,
        intervalMonths: built.interval,
        startMonth: built.startMonth,
        endMonth: built.endMonth,
        terms: termsToWire([{ fromMonth: built.startMonth, ...built.values }]),
      };
      const check = PlanItemCreateFields.safeParse(fields);
      if (!check.success) return setFormError(check.error.issues[0]?.message ?? REFUSALS.VALIDATION_FAILED!);
      change = changes.createPlanItem(crypto.randomUUID(), fields);
    } else {
      const diff: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(common)) if (JSON.stringify((item as unknown as Record<string, unknown>)[key]) !== JSON.stringify(value)) diff[key] = value;
      if (frequency !== item.frequency || built.interval !== item.intervalMonths) {
        diff.frequency = frequency;
        diff.intervalMonths = built.interval;
      }
      if (built.startMonth !== item.startMonth) diff.startMonth = built.startMonth;
      if (built.endMonth !== item.endMonth) diff.endMonth = built.endMonth;
      let terms: PlanTerm[] = built.startMonth !== item.startMonth ? moveStart(item.terms, built.startMonth) : item.terms;
      const now = termFor({ terms }, built.from);
      const values = built.values;
      if (now.amountMinor !== values.amountMinor || now.dueDay !== values.dueDay || now.accountId !== values.accountId) {
        try {
          terms = editTerms(terms, built.from, values, currentMonth);
        } catch (e) {
          if (e instanceof PlanRuleError) return setFormError(REFUSALS[e.code]!);
          throw e;
        }
      }
      if (JSON.stringify(termsToWire(terms)) !== JSON.stringify(termsToWire(item.terms))) diff.terms = termsToWire(terms);
      if (Object.keys(diff).length === 0) return router.push(returnTo);
      change = changes.updatePlanItem(item.id, diff);
    }
    setBusy(true);
    const outcome = await push([change]);
    setBusy(false);
    if (!outcome.ok) return setFormError(outcome.error.code === "NETWORK" ? "You appear to be offline. Please try again." : outcome.error.message);
    const rejected = outcome.results.find((r) => r.status === "rejected");
    if (rejected) return setFormError((rejected.code && REFUSALS[rejected.code]) || "The planned payment could not be saved.");
    router.push(returnTo);
  }

  async function remove() {
    if (!item) return;
    setBusy(true);
    const outcome = await push([changes.deletePlanItem(item.id)]);
    setBusy(false);
    setConfirmDelete(false);
    if (!outcome.ok) return setFormError(outcome.error.message);
    if (outcome.results[0]?.status === "rejected") return setFormError("It could not be deleted.");
    router.push(returnTo);
  }

  const err = (field: Field) =>
    errors[field] ? (
      <p id={`${ids}-${field}-error`} className="text-sm text-red-700 dark:text-red-300">
        {errors[field]}
      </p>
    ) : null;
  const described = (field: Field, hint?: string) => [hint, errors[field] ? `${ids}-${field}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
      className="flex max-w-xl flex-col gap-5"
    >
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-name`}>Name</Label>
        <Input id={`${ids}-name`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name || undefined} aria-describedby={described("name")} />
        {err("name")}
      </div>

      {item ? (
        <p className="text-sm text-muted-foreground">
          Pays: <span className="font-medium text-foreground">{TARGET_TEXT[item.target]}</span>
        </p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">What it pays</legend>
          <div className="flex flex-wrap gap-4">
            {(Object.keys(TARGET_TEXT) as PlanTarget[]).map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input type="radio" name={`${ids}-target`} checked={target === t} onChange={() => { setTarget(t); setPayeeId(""); }} />
                {TARGET_TEXT[t]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {target === "payee" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-payee`}>Paid to</Label>
            <select id={`${ids}-payee`} className={selectClass} value={payeeId} onChange={(e) => setPayeeId(e.target.value)} aria-invalid={!!errors.payee || undefined} aria-describedby={described("payee")}>
              <option value="">Choose a payee</option>
              {businesses.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {err("payee")}
          </div>
          <CategoryPicker label="Category (optional)" categories={categories} value={categoryId} onChange={setCategoryId} kind="expense" categoriesStart={categoriesStart} noneLabel="No category" />
        </>
      )}
      {target === "card" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-card`}>Credit card</Label>
          <select id={`${ids}-card`} className={selectClass} value={cardId} onChange={(e) => setCardId(e.target.value)} aria-invalid={!!errors.card || undefined} aria-describedby={described("card")}>
            <option value="">Choose a card</option>
            {cards.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {err("card")}
        </div>
      )}
      {target === "person" && (
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-action`}>Payment</Label>
            <select id={`${ids}-action`} className={selectClass} value={personAction} onChange={(e) => setPersonAction(e.target.value as PlanPersonAction)}>
              {PLAN_PERSON_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {PERSON_ACTION_TEXT[a]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-person`}>Person</Label>
            <select id={`${ids}-person`} className={selectClass} value={payeeId} onChange={(e) => setPayeeId(e.target.value)} aria-invalid={!!errors.payee || undefined} aria-describedby={described("payee")}>
              <option value="">Choose a person</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {err("payee")}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-amount`}>{target === "card" ? "Usual amount (optional)" : "Amount"}</Label>
        <Input id={`${ids}-amount`} inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!errors.amount || undefined} aria-describedby={described("amount", `${ids}-varies-hint`)} />
        {err("amount")}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={varies} onChange={(e) => setVaries(e.target.checked)} />
          Amount varies
        </label>
        <p id={`${ids}-varies-hint`} className="text-sm text-muted-foreground">
          {target === "card"
            ? "A card bill that varies is estimated from what the card owes, until you set the month's amount."
            : "When it varies, each month is estimated from last month's payment until you set that month's amount."}
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-due`}>Due day</Label>
          <Input id={`${ids}-due`} type="number" min={1} max={31} className="w-24" value={dueDay} onChange={(e) => setDueDay(e.target.value)} aria-invalid={!!errors.dueDay || undefined} aria-describedby={described("dueDay", `${ids}-due-hint`)} />
          <p id={`${ids}-due-hint`} className="text-xs text-muted-foreground">
            In shorter months, the last day.
          </p>
          {err("dueDay")}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-account`}>Paid from</Label>
          <select id={`${ids}-account`} className={selectClass} value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-invalid={!!errors.account || undefined} aria-describedby={described("account")}>
            <option value="">Choose an account</option>
            {accountChoices.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.state !== "active" ? " (archived)" : ""}
              </option>
            ))}
          </select>
          {err("account")}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-frequency`}>How often</Label>
          <select id={`${ids}-frequency`} className={selectClass} value={frequency} onChange={(e) => setFrequency(e.target.value as PlanFrequency)}>
            {(Object.keys(FREQUENCY_TEXT) as PlanFrequency[]).map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_TEXT[f]}
              </option>
            ))}
          </select>
        </div>
        {frequency === "every_n_months" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-n`}>Every how many months</Label>
            <Input id={`${ids}-n`} type="number" min={2} max={12} className="w-24" value={everyN} onChange={(e) => setEveryN(e.target.value)} aria-invalid={!!errors.everyN || undefined} aria-describedby={described("everyN")} />
            {err("everyN")}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-start`}>{frequency === "one_off" ? "Month" : "First month"}</Label>
          <Input id={`${ids}-start`} type="month" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={!!errors.start || undefined} aria-describedby={described("start")} />
          {err("start")}
        </div>
        {frequency !== "one_off" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-end`}>Last month (optional)</Label>
            <Input id={`${ids}-end`} type="month" value={end} onChange={(e) => setEnd(e.target.value)} aria-invalid={!!errors.end || undefined} aria-describedby={described("end")} />
            {err("end")}
          </div>
        )}
      </div>

      {item && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-from`}>Apply amount, day and account changes from</Label>
          <Input id={`${ids}-from`} type="month" min={toParam(currentMonth)} value={applyFrom} onChange={(e) => setApplyFrom(e.target.value)} aria-invalid={!!errors.applyFrom || undefined} aria-describedby={described("applyFrom", `${ids}-from-hint`)} className="w-48" />
          <p id={`${ids}-from-hint`} className="text-sm text-muted-foreground">
            Earlier months keep what they showed.
          </p>
          {err("applyFrom")}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-notes`}>Notes (optional)</Label>
        <textarea id={`${ids}-notes`} value={notes} maxLength={500} rows={2} onChange={(e) => setNotes(e.target.value)} aria-invalid={!!errors.notes || undefined} aria-describedby={described("notes")} className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm" />
        {err("notes")}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(returnTo)}>
          Cancel
        </Button>
        {item && (
          <Button type="button" variant="destructive" className="ml-auto" disabled={busy} onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog title="Delete this planned payment?" confirmLabel="Delete" destructive busy={busy} onConfirm={() => void remove()} onCancel={() => setConfirmDelete(false)}>
          {paidMonths > 0
            ? `Its ${paidMonths === 1 ? "paid month stays" : `${paidMonths} paid months stay`} in the plan, shown as removed. Every other month of it goes. The transactions are not changed.`
            : "Every month of it leaves the plan. No transactions are changed."}
        </ConfirmDialog>
      )}
    </form>
  );
}
