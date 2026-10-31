"use client";

import { useId, useMemo, useState } from "react";
import { compareNames, type PayeeKind, type PayeeView } from "@ft/core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_OPTIONS = 50;

/** The payee chosen in a form: an existing one, or a new one added when the transaction is saved. */
export type PayeeChoice = { type: "existing"; id: string } | { type: "new"; name: string; kind: PayeeKind } | null;

type Option =
  | { key: string; type: "none"; label: string }
  | { key: string; type: "existing"; id: string; label: string; kind: PayeeKind }
  | { key: string; type: "new"; name: string; kind: PayeeKind; label: string };

/**
 * Choose a payee by typing part of the name (R4 FR-005, FR-006). Hidden payees are left out unless
 * already chosen. A name that does not exist yet is offered as a new business or person, created
 * together with the transaction. A WAI-ARIA combobox: arrows move, Enter chooses, Escape closes.
 */
export function PayeeCombobox({
  label,
  payees,
  value,
  onChange,
  onlyPeople = false,
  noneLabel,
  describedBy,
  invalid,
}: {
  label: string;
  payees: PayeeView[];
  value: PayeeChoice;
  onChange: (choice: PayeeChoice) => void;
  /** Person movements choose among people only (FR-011). */
  onlyPeople?: boolean;
  /** Offer "no payee" with this label. */
  noneLabel?: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selectedId = value?.type === "existing" ? value.id : null;
  const selectedLabel =
    value === null
      ? (noneLabel ?? "")
      : value.type === "new"
        ? `${value.name} (new ${value.kind})`
        : (payees.find((p) => p.id === value.id)?.name ?? "");

  const options: Option[] = useMemo(() => {
    const q = query.trim();
    const lower = q.toLocaleLowerCase("en");
    const matches: Option[] = payees
      .filter((p) => (!onlyPeople || p.kind === "person") && (!p.hidden || p.id === selectedId))
      .filter((p) => lower === "" || p.name.toLocaleLowerCase("en").includes(lower))
      .sort((a, b) => compareNames(a.name, b.name))
      .slice(0, MAX_OPTIONS)
      .map((p) => ({ key: p.id, type: "existing", id: p.id, label: p.name, kind: p.kind }));
    const list: Option[] = [];
    if (noneLabel !== undefined && noneLabel.toLocaleLowerCase("en").includes(lower)) list.push({ key: "none", type: "none", label: noneLabel });
    list.push(...matches);
    const exists = payees.some((p) => p.name.toLocaleLowerCase("en") === lower);
    if (q !== "" && !exists && [...q].length <= 60) {
      if (!onlyPeople) list.push({ key: "new-business", type: "new", name: q, kind: "business", label: `Add “${q}” as a new business` });
      list.push({ key: "new-person", type: "new", name: q, kind: "person", label: `Add “${q}” as a new person` });
    }
    return list;
  }, [query, payees, onlyPeople, selectedId, noneLabel]);

  function openList() {
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  function choose(option: Option) {
    if (option.type === "none") onChange(null);
    else if (option.type === "existing") onChange({ type: "existing", id: option.id });
    else onChange({ type: "new", name: option.name, kind: option.kind });
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = options[active];
      if (option) choose(option);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  const listId = `${ids}-list`;
  const optionId = (i: number) => `${ids}-option-${i}`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${ids}-input`}>{label}</Label>
      <Input
        id={`${ids}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? optionId(active) : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        placeholder="Type to search or add"
        value={open ? query : selectedLabel}
        onFocus={openList}
        onClick={() => !open && openList()}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && options.length === 0 && (
        <p id={listId} role="status" className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
          {onlyPeople ? "No matching people" : "No matching payees"}
        </p>
      )}
      {open && options.length > 0 && (
        <ul id={listId} role="listbox" aria-label={label} className="max-h-60 w-full overflow-auto rounded-md border border-border bg-background py-1">
          {options.map((option, i) => (
            <li
              key={option.key}
              id={optionId(i)}
              role="option"
              aria-selected={option.type === "existing" ? option.id === selectedId : option.type === "none" && value === null}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${i === active ? "bg-muted" : ""} ${option.type === "new" ? "font-medium" : ""}`}
            >
              {option.label}
              {option.type === "existing" && !onlyPeople && option.kind === "person" && (
                <span className="text-muted-foreground"> · Person</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
