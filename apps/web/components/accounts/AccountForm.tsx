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
  formatAmountInput,
  isOwedType,
  parseAmountInput,
  type AccountType,
  type AccountView,
  type AmountInputError,
  type ChangeResult,
  type GroupView,
} from "@ft/core";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Money } from "@/components/Money";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changes, useSyncPush } from "@/lib/sync-client";
import { AccountIcon } from "./AccountIcon";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

const AMOUNT_MESSAGES: Record<AmountInputError, string> = {
  NOT_A_NUMBER: "Enter an amount like 52,340.50.",
  TOO_MANY_DECIMALS: "Use at most two decimal places.",
  OUT_OF_RANGE: "The amount is too large.",
  NEGATIVE_NOT_ALLOWED: "Enter an amount greater than zero.",
};

type Field = "name" | "balance" | "date" | "credit" | "notes";

const REJECTION_MESSAGES: Partial<Record<NonNullable<ChangeResult["code"]>, { field?: Field; message: string }>> = {
  NAME_TAKEN: { field: "name", message: "You already have an account with this name. Choose another name." },
  DATE_IN_FUTURE: { field: "date", message: "The date must be today or earlier." },
  LIMIT_REACHED: { message: "You have reached the limit of 200 accounts. Archive or delete accounts you no longer use." },
  NOT_FOUND: { message: "This account no longer exists." },
};

const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " ");

type Props = {
  todayIso: string;
  currency: string;
  groups: GroupView[];
  /** Archived accounts, so a name clash can point to restoring them (FR-002, US4 scenario 6). */
  archived: { id: string; name: string }[];
} & (
  | { mode: "create"; nextSortKey: string }
  | { mode: "edit"; account: AccountView }
);

/**
 * Add / edit account form (R2 US1, US3; FR-001–FR-011, FR-018). Amounts are parsed to exact paise
 * in the browser (no rounding) and the server re-checks everything (contracts/sync-protocol.md).
 * Editing sends only the fields that changed, so edits from two tabs or devices combine (FR-030).
 */
export function AccountForm(props: Props) {
  const { todayIso, currency, groups, archived } = props;
  const original = props.mode === "edit" ? props.account : null;
  const ids = useId();
  const router = useRouter();
  const push = useSyncPush();

  const [name, setName] = useState(original?.name ?? "");
  const [type, setType] = useState<AccountType>(original?.type ?? "bank");
  const [balance, setBalance] = useState(original ? formatAmountInput(original.openingBalanceMinor, currency) : "");
  const [date, setDate] = useState(original?.openingBalanceDate ?? todayIso);
  const [appearance, setAppearance] = useState(() =>
    original ? { colour: original.colour, icon: original.icon, chosen: true } : { ...defaultAppearance("bank"), chosen: false },
  );
  const [credit, setCredit] = useState(original?.creditLimitMinor ? formatAmountInput(original.creditLimitMinor, currency) : "");
  const [notes, setNotes] = useState(original?.notes ?? "");
  const [include, setInclude] = useState(original?.includeInNetWorth ?? true);
  const [groupId, setGroupId] = useState<string>(original?.groupId ?? "");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [archivedMatch, setArchivedMatch] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ fields: Record<string, unknown>; balance: bigint } | null>(null);

  const owed = isOwedType(type);

  function changeType(next: AccountType) {
    setType(next);
    // Follow the type's default look until the user picks their own (FR-008).
    if (!appearance.chosen) setAppearance({ ...defaultAppearance(next), chosen: false });
  }

  /** Validated field values (wire format), or null with errors shown. */
  function validate(): { fields: Record<string, unknown>; balance: bigint } | null {
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
      balance: amount.minor,
      fields: {
        name: trimmed,
        type,
        openingBalanceMinor: amount.minor.toString(),
        openingBalanceDate: date,
        colour: appearance.colour,
        icon: appearance.icon,
        groupId: groupId === "" ? null : groupId,
        includeInNetWorth: include,
        notes: notes.trim() === "" ? null : notes.trim(),
        // A card's limit; an owned type never has one (the server drops it on a type change).
        ...(owed ? { creditLimitMinor: limit === null ? null : limit.toString() } : {}),
      },
    };
  }

  /** Only the fields that differ from the saved account (research R2-05). */
  function changedFields(fields: Record<string, unknown>, account: AccountView): Record<string, unknown> {
    const saved: Record<string, unknown> = {
      name: account.name,
      type: account.type,
      openingBalanceMinor: account.openingBalanceMinor.toString(),
      openingBalanceDate: account.openingBalanceDate,
      colour: account.colour,
      icon: account.icon,
      groupId: account.groupId,
      includeInNetWorth: account.includeInNetWorth,
      notes: account.notes,
      creditLimitMinor: account.creditLimitMinor === null ? null : account.creditLimitMinor.toString(),
    };
    return Object.fromEntries(Object.entries(fields).filter(([key, value]) => saved[key] !== value));
  }

  async function save(fields: Record<string, unknown>) {
    setBusy(true);
    const change =
      props.mode === "create"
        ? changes.createAccount(crypto.randomUUID(), { ...fields, sortKey: props.nextSortKey })
        : changes.updateAccount(props.account.id, fields);
    const outcome = await push([change]);
    setBusy(false);
    setConfirm(null);
    if (!outcome.ok) {
      setFormError(outcome.error.code === "NETWORK" ? "You appear to be offline. Please try again." : outcome.error.message);
      return;
    }
    const result = outcome.results[0];
    if (result?.status === "rejected") {
      const clash = result.code === "NAME_TAKEN" ? archived.find((a) => a.name.toLowerCase() === String(fields.name ?? name.trim()).toLowerCase()) : undefined;
      if (clash) {
        setArchivedMatch(clash);
        setErrors({ name: "An archived account has this name — restore it or choose another name." });
        return;
      }
      const known = result.code ? REJECTION_MESSAGES[result.code] : undefined;
      if (known?.field) setErrors({ [known.field]: known.message });
      else setFormError(known?.message ?? "This account could not be saved. Check the values and try again.");
      return;
    }
    router.push("/accounts");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setArchivedMatch(null);
    const valid = validate();
    if (!valid) return;
    if (props.mode === "create") return save(valid.fields);

    const fields = changedFields(valid.fields, props.account);
    if (Object.keys(fields).length === 0) {
      router.push("/accounts");
      return;
    }
    // Moving between owned and owed changes the totals: ask first (FR-011).
    if ("type" in fields && isOwedType(props.account.type) !== owed) {
      setConfirm({ fields, balance: valid.balance });
      return;
    }
    return save(fields);
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
        {archivedMatch && errors.name && (
          <Link href={`/accounts/${archivedMatch.id}`} className="text-sm text-brand-strong underline dark:text-brand">
            Open the archived account
          </Link>
        )}
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

      {groups.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-group`}>Group</Label>
          <select id={`${ids}-group`} className={selectClass} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">No group</option>
            {[...groups].sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0)).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
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
                className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
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
                className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
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
          {busy ? "Saving…" : props.mode === "create" ? "Add account" : "Save changes"}
        </Button>
        <Link href="/accounts" className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>

      {confirm && (
        <ConfirmDialog
          title={`Change ${name.trim() || "this account"} to ${ACCOUNT_TYPE_LABEL[type].toLowerCase()}?`}
          confirmLabel="Change type"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void save(confirm.fields)}
        >
          <p>
            Its balance will count as {owed ? "owed instead of owned" : "owned instead of owed"}
            {include ? "," : "."}
            {include && (
              <>
                {" "}
                so your net worth changes by{" "}
                <Money value={owed ? -2n * confirm.balance : 2n * confirm.balance} currency={currency} />.
              </>
            )}
          </p>
          <p>
            {owed
              ? "From now on the amount is what you owe on the card."
              : "From now on the amount is what the account holds."}
          </p>
        </ConfirmDialog>
      )}
    </form>
  );
}
