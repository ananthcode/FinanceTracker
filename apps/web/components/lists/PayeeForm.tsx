"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  formatAmountInput,
  parseAmountInput,
  type AmountInputError,
  type CategoriesStart,
  type CategoryView,
  type PayeeKind,
  type PayeeView,
} from "@ft/core";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changes, useSyncPush } from "@/lib/sync-client";
import { CategoryPicker } from "./CategoryPicker";
import { refusal } from "./messages";

const AMOUNT_MESSAGES: Record<AmountInputError, string> = {
  NOT_A_NUMBER: "Enter an amount like 15,000.00.",
  TOO_MANY_DECIMALS: "Use at most two decimal places.",
  OUT_OF_RANGE: "The amount is too large.",
  NEGATIVE_NOT_ALLOWED: "Enter the amount without a minus sign and choose who owes whom.",
};

type Direction = "they_owe" | "i_owe";
type Field = "name" | "amount" | "date" | "notes";

/**
 * Add or edit a payee (R3 FR-012 – FR-016, FR-020). Businesses have a name, an optional default
 * category and notes; people also have an opening balance with its direction, a date and the
 * "Include in net worth" switch. Only changed fields are sent when editing.
 */
export function PayeeForm({
  mode,
  fixedKind,
  categories,
  categoriesStart,
  todayIso,
  payees,
  returnTo,
}: {
  mode: { type: "create"; kind: PayeeKind } | { type: "edit"; payee: PayeeView };
  /** The People screens only add and edit people. */
  fixedKind?: PayeeKind;
  categories: CategoryView[];
  categoriesStart: CategoriesStart | null;
  todayIso: string;
  /** The user's other payees, to point at the existing one when a name is taken. */
  payees: { id: string; name: string }[];
  returnTo: string;
}) {
  const ids = useId();
  const router = useRouter();
  const push = useSyncPush();
  const saved = mode.type === "edit" ? mode.payee : null;
  const [name, setName] = useState(saved?.name ?? "");
  const [kind, setKind] = useState<PayeeKind>(saved?.kind ?? fixedKind ?? (mode.type === "create" ? mode.kind : "business"));
  const [defaultCategoryId, setDefaultCategoryId] = useState<string | null>(saved?.defaultCategoryId ?? null);
  const [notes, setNotes] = useState(saved?.notes ?? "");
  const opening = saved?.openingBalanceMinor ?? 0n;
  const [amount, setAmount] = useState(saved && opening !== 0n ? formatAmountInput(opening < 0n ? -opening : opening) : "");
  const [direction, setDirection] = useState<Direction>(opening < 0n ? "i_owe" : "they_owe");
  const [date, setDate] = useState(saved?.openingBalanceDate ?? todayIso);
  const [includeInNetWorth, setIncludeInNetWorth] = useState(saved?.includeInNetWorth ?? false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [clash, setClash] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const person = kind === "person";

  function validate(): Record<string, unknown> | null {
    const next: Partial<Record<Field, string>> = {};
    const trimmed = name.trim();
    const length = [...trimmed].length;
    if (length < 1) next.name = "Enter a name.";
    else if (length > 60) next.name = "Use at most 60 characters.";
    if ([...notes].length > 500) next.notes = "Use at most 500 characters.";

    const fields: Record<string, unknown> = {
      name: trimmed,
      kind,
      defaultCategoryId,
      notes: notes.trim() === "" ? null : notes,
    };
    if (person) {
      const parsed = amount.trim() === "" ? ({ ok: true, minor: 0n } as const) : parseAmountInput(amount);
      if (!parsed.ok) next.amount = AMOUNT_MESSAGES[parsed.error];
      if (!date) next.date = "Choose a date.";
      else if (date > todayIso) next.date = "The date must be today or earlier.";
      if (parsed.ok) {
        const signed = direction === "i_owe" ? -parsed.minor : parsed.minor;
        fields.openingBalanceMinor = signed.toString();
      }
      fields.openingBalanceDate = date;
      fields.includeInNetWorth = includeInNetWorth;
    }
    setErrors(next);
    return Object.keys(next).length === 0 ? fields : null;
  }

  /** Only what differs from the saved payee; a person becoming a business sends just the kind. */
  function changed(fields: Record<string, unknown>, payee: PayeeView): Record<string, unknown> {
    const before: Record<string, unknown> = {
      name: payee.name,
      kind: payee.kind,
      defaultCategoryId: payee.defaultCategoryId,
      notes: payee.notes,
      openingBalanceMinor: payee.openingBalanceMinor.toString(),
      openingBalanceDate: payee.openingBalanceDate,
      includeInNetWorth: payee.includeInNetWorth,
    };
    return Object.fromEntries(Object.entries(fields).filter(([key, value]) => before[key] !== value));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setClash(null);
    const fields = validate();
    if (!fields) return;
    let change;
    if (mode.type === "create") {
      change = changes.createPayee(crypto.randomUUID(), fields);
    } else {
      const diff = changed(fields, mode.payee);
      if (Object.keys(diff).length === 0) return router.push(returnTo);
      change = changes.updatePayee(mode.payee.id, diff);
    }
    setBusy(true);
    const outcome = await push([change]);
    setBusy(false);
    const problem = refusal(outcome, "The payee could not be saved. Check the details and try again.", {
      LIMIT_REACHED: "You can have up to 2,000 payees. Merge or delete ones you no longer use.",
      BALANCE_NOT_ZERO: "Settle this person's balance to ₹0.00 before making them a business.",
      DATE_BEFORE_OPENING: "This person has transactions before that date. Choose a date on or before their earliest one.",
      INVALID_PERSON: "This person has transactions, so they can't become a business.",
    });
    if (problem) {
      const rejected = outcome.ok ? outcome.results[0]?.code : undefined;
      if (rejected === "NAME_TAKEN") {
        setErrors({ name: "You already have a payee with this name." });
        setClash(payees.find((p) => p.name.toLowerCase() === String(fields.name).toLowerCase()) ?? null);
      } else if (rejected === "DATE_IN_FUTURE" || rejected === "DATE_BEFORE_OPENING") {
        setErrors({ date: problem });
      } else {
        setFormError(problem);
      }
      return;
    }
    router.push(returnTo);
  }

  const err = (field: Field) =>
    errors[field] ? (
      <p id={`${ids}-${field}-error`} className="text-sm text-red-700 dark:text-red-300">
        {errors[field]}
      </p>
    ) : null;
  const describedBy = (field: Field, hint?: string) =>
    [hint, errors[field] ? `${ids}-${field}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-5">
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-name`}>Name</Label>
        <Input
          id={`${ids}-name`}
          value={name}
          maxLength={60}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!errors.name}
          aria-describedby={describedBy("name")}
        />
        {err("name")}
        {clash && (
          <Link
            href={`${returnTo === "/people" ? "/people" : "/settings/payees"}/${clash.id}`}
            className="text-sm text-brand-strong underline dark:text-brand"
          >
            Open {clash.name}
          </Link>
        )}
      </div>

      {!fixedKind && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">This payee is</legend>
          <div className="flex flex-wrap gap-4">
            {(["business", "person"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="radio" name={`${ids}-kind`} value={k} checked={kind === k} onChange={() => setKind(k)} />
                {k === "business" ? "A business" : "A person"}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {person && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Opening balance</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${ids}-direction`}
                  checked={direction === "they_owe"}
                  onChange={() => setDirection("they_owe")}
                />
                They owe me
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name={`${ids}-direction`} checked={direction === "i_owe"} onChange={() => setDirection("i_owe")} />
                I owe them
              </label>
            </div>
            <Label htmlFor={`${ids}-amount`}>Amount</Label>
            <Input
              id={`${ids}-amount`}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              placeholder="0.00"
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!errors.amount}
              aria-describedby={describedBy("amount", `${ids}-amount-hint`)}
            />
            <p id={`${ids}-amount-hint`} className="text-sm text-muted-foreground">
              Leave empty or 0 when you are settled.
            </p>
            {err("amount")}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-date`}>Balance on</Label>
            <Input
              id={`${ids}-date`}
              type="date"
              value={date}
              max={todayIso}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!errors.date}
              aria-describedby={describedBy("date")}
            />
            {err("date")}
          </div>
          <div className="flex items-start gap-2">
            <input
              id={`${ids}-include`}
              type="checkbox"
              checked={includeInNetWorth}
              onChange={(e) => setIncludeInNetWorth(e.target.checked)}
              className="mt-1"
              aria-describedby={`${ids}-include-hint`}
            />
            <div className="flex flex-col">
              <Label htmlFor={`${ids}-include`}>Include in net worth</Label>
              <p id={`${ids}-include-hint`} className="text-sm text-muted-foreground">
                Adds what they owe you to Owned (or what you owe them to Owed) on the Accounts screen.
              </p>
            </div>
          </div>
        </>
      )}

      <CategoryPicker
        label="Default category (optional)"
        categories={categories}
        value={defaultCategoryId}
        onChange={setDefaultCategoryId}
        categoriesStart={categoriesStart}
        noneLabel="No default category"
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-notes`}>Notes (optional)</Label>
        <textarea
          id={`${ids}-notes`}
          value={notes}
          maxLength={500}
          rows={3}
          onChange={(e) => setNotes(e.target.value)}
          aria-invalid={!!errors.notes}
          aria-describedby={describedBy("notes")}
          className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
        />
        {err("notes")}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {mode.type === "create" ? (person ? "Add person" : "Add payee") : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(returnTo)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
