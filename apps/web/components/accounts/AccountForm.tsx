"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  ACCOUNT_COLOUR_KEYS,
  ACCOUNT_ICON_KEYS,
  ACCOUNT_TYPE_LABEL,
  ACCOUNT_TYPES,
  defaultAppearance,
  isOwedType,
  parseAmountInput,
  type AmountInputError,
  type AccountType,
  type ChangeResult,
} from "@ft/core";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changes, useSyncPush } from "@/lib/sync-client";
import { AccountIcon } from "./AccountIcon";

type AccountInputErrorCode = AmountInputError;

const selectClass = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

const AMOUNT_MESSAGES: Record<AccountInputErrorCode, string> = {
  NOT_A_NUMBER: "Enter an amount like 52,340.50.",
  TOO_MANY_DECIMALS: "Use at most two decimal places.",
  OUT_OF_RANGE: "The amount is too large.",
  NEGATIVE_NOT_ALLOWED: "Enter an amount greater than zero.",
};

const REJECTION_MESSAGES: Partial<Record<NonNullable<ChangeResult["code"]>, { field?: Field; message: string }>> = {
  NAME_TAKEN: { field: "name", message: "You already have an account with this name. Choose another name." },
  DATE_IN_FUTURE: { field: "date", message: "The date must be today or earlier." },
  LIMIT_REACHED: { message: "You have reached the limit of 200 accounts. Archive or delete accounts you no longer use." },
};

type Field = "name" | "balance" | "date" | "credit" | "notes";

const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " ");

/**
 * Add-account form (R2 US1; FR-001–FR-008, FR-018). Amounts are parsed to exact paise in the
 * browser (no rounding) and the server re-checks everything (contracts/sync-protocol.md).
 */
export function AccountForm({
  todayIso,
  currency,
  nextSortKey,
}: {
  todayIso: string;
  currency: string;
  nextSortKey: string;
}) {
  const ids = useId();
  const router = useRouter();
  const push = useSyncPush();

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(todayIso);
  const [appearance, setAppearance] = useState(() => ({ ...defaultAppearance("bank"), chosen: false }));
  const [credit, setCredit] = useState("");
  const [notes, setNotes] = useState("");
  const [include, setInclude] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const owed = isOwedType(type);

  function changeType(next: AccountType) {
    setType(next);
    // Follow the type's default look until the user picks their own (FR-008).
    if (!appearance.chosen) setAppearance({ ...defaultAppearance(next), chosen: false });
  }

  function validate(): { fields: Record<string, unknown> } | null {
    const next: Partial<Record<Field, string>> = {};
    const trimmed = name.trim();
    if ([...trimmed].length < 1) next.name = "Enter a name.";
    else if ([...trimmed].length > 40) next.name = "Use at most 40 characters.";

    const amount = parseAmountInput(balance, { allowNegative: true, currency });
    if (!amount.ok) next.balance = AMOUNT_MESSAGES[amount.error];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = "Enter a date.";
    else if (date > todayIso) next.date = "The date must be today or earlier.";

    let limit: bigint | null = null;
    if (owed && credit.trim() !== "") {
      const parsed = parseAmountInput(credit, { currency });
      if (!parsed.ok) next.credit = AMOUNT_MESSAGES[parsed.error];
      else if (parsed.minor <= 0n) next.credit = "Enter a limit greater than zero, or leave it empty.";
      else limit = parsed.minor;
    }
    if ([...notes].length > 500) next.notes = "Use at most 500 characters.";

    setErrors(next);
    if (Object.keys(next).length > 0 || !amount.ok) return null;
    return {
      fields: {
        name: trimmed,
        type,
        openingBalanceMinor: amount.minor.toString(),
        openingBalanceDate: date,
        colour: appearance.colour,
        icon: appearance.icon,
        sortKey: nextSortKey,
        includeInNetWorth: include,
        notes: notes.trim() === "" ? null : notes.trim(),
        creditLimitMinor: limit === null ? null : limit.toString(),
      },
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const valid = validate();
    if (!valid) return;
    setBusy(true);
    const outcome = await push([changes.createAccount(crypto.randomUUID(), valid.fields)]);
    setBusy(false);
    if (!outcome.ok) {
      setFormError(outcome.error.code === "NETWORK" ? "You appear to be offline. Please try again." : outcome.error.message);
      return;
    }
    const result = outcome.results[0];
    if (result?.status === "rejected") {
      const known = result.code ? REJECTION_MESSAGES[result.code] : undefined;
      if (known?.field) setErrors({ [known.field]: known.message });
      else setFormError(known?.message ?? "This account could not be saved. Check the values and try again.");
      return;
    }
    router.push("/accounts");
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
          maxLength={40}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!errors.name}
          aria-describedby={describedBy("name")}
        />
        {err("name")}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-type`}>Type</Label>
        <select id={`${ids}-type`} className={selectClass} value={type} onChange={(e) => changeType(e.target.value as AccountType)}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-balance`}>{owed ? "Amount owed" : "Opening balance"}</Label>
        <Input
          id={`${ids}-balance`}
          inputMode="decimal"
          autoComplete="off"
          value={balance}
          placeholder="0.00"
          onChange={(e) => setBalance(e.target.value)}
          aria-invalid={!!errors.balance}
          aria-describedby={describedBy("balance", `${ids}-balance-hint`)}
        />
        <p id={`${ids}-balance-hint`} className="text-sm text-muted-foreground">
          {owed
            ? "What you owed on the card on the date below. Enter a negative amount if the card was in credit."
            : "What the account held on the date below. Enter a negative amount if it was overdrawn."}
        </p>
        {err("balance")}
      </div>

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
          className="w-auto"
        />
        {err("date")}
      </div>

      {owed && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-credit`}>Credit limit (optional)</Label>
          <Input
            id={`${ids}-credit`}
            inputMode="decimal"
            autoComplete="off"
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
            aria-invalid={!!errors.credit}
            aria-describedby={describedBy("credit")}
          />
          {err("credit")}
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_COLOUR_KEYS.map((key) => (
            <label key={key} className="relative cursor-pointer">
              <input
                type="radio"
                name={`${ids}-colour`}
                value={key}
                checked={appearance.colour === key}
                onChange={() => setAppearance({ ...appearance, colour: key, chosen: true })}
                aria-label={label(key)}
                className="peer sr-only"
              />
              <span className="block rounded-full p-0.5 ring-offset-2 peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-brand">
                <AccountIcon icon={appearance.icon} colour={key} size="sm" />
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Icon</legend>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_ICON_KEYS.map((key) => (
            <label key={key} className="relative cursor-pointer">
              <input
                type="radio"
                name={`${ids}-icon`}
                value={key}
                checked={appearance.icon === key}
                onChange={() => setAppearance({ ...appearance, icon: key, chosen: true })}
                aria-label={label(key)}
                className="peer sr-only"
              />
              <span className="block rounded-full p-0.5 ring-offset-2 peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-brand">
                <AccountIcon icon={key} colour={appearance.colour} size="sm" />
              </span>
            </label>
          ))}
        </div>
      </fieldset>

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

      <div className="flex items-start gap-2">
        <input
          id={`${ids}-include`}
          type="checkbox"
          checked={include}
          onChange={(e) => setInclude(e.target.checked)}
          aria-describedby={`${ids}-include-hint`}
          className="mt-0.5 size-4"
        />
        <div>
          <Label htmlFor={`${ids}-include`}>Include in net worth</Label>
          <p id={`${ids}-include-hint`} className="text-sm text-muted-foreground">
            Turn off for money you look after for someone else; its balance is still shown.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Add account"}
        </Button>
        <Link href="/accounts" className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
