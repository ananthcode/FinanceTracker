"use client";

import { useId, useMemo, useRef, useState } from "react";
import { categoryPath, indexCategories, searchCategories, type CategoriesStart, type CategoryKind, type CategoryView } from "@ft/core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StartCategoriesDialog } from "./StartCategoriesDialog";

const MAX_OPTIONS = 50;

type Option = { id: string | null; label: string; kind?: CategoryKind };

/**
 * Choose a category by typing any part of its name (R3 FR-005, research R3-13). Matches show their
 * full path, Expense before Income; hidden categories are left out unless already chosen
 * (FR-022). A WAI-ARIA combobox: arrows move, Enter chooses, Escape closes. The first time the
 * user has not yet made the start choice, opening it asks that first (FR-007). R4 reuses it.
 */
export function CategoryPicker({
  label,
  categories,
  value,
  onChange,
  kind,
  categoriesStart,
  exclude,
  noneLabel,
  describedBy,
}: {
  label: string;
  categories: CategoryView[];
  value: string | null;
  onChange: (id: string | null) => void;
  kind?: CategoryKind;
  categoriesStart: CategoriesStart | null;
  /** Categories that may not be chosen here (e.g. a move's own subtree). */
  exclude?: ReadonlySet<string>;
  /** Offer "no category" with this label (e.g. "No default category", "Top level"). */
  noneLabel?: string;
  describedBy?: string;
}) {
  const ids = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [askStart, setAskStart] = useState(false);
  // The server's answer arrives with the next render; until then remember it was given here
  // (a ref, so the focus handler that runs straight after the dialog closes already sees it).
  const startedHere = useRef(false);

  const index = useMemo(() => indexCategories(categories), [categories]);
  const selectedLabel = value ? categoryPath(value, index) : (noneLabel ?? "");

  const options: Option[] = useMemo(() => {
    const matches = searchCategories(query, categories, { kind, selectedId: value })
      .filter((m) => !exclude?.has(m.category.id))
      .slice(0, MAX_OPTIONS)
      .map((m) => ({ id: m.category.id, label: m.path, kind: m.category.kind }));
    const q = query.trim().toLocaleLowerCase("en");
    const offerNone = noneLabel !== undefined && noneLabel.toLocaleLowerCase("en").includes(q);
    return offerNone ? [{ id: null, label: noneLabel }, ...matches] : matches;
  }, [query, categories, kind, value, exclude, noneLabel]);

  function openList() {
    if (categoriesStart === null && !startedHere.current) {
      setAskStart(true);
      return;
    }
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  function choose(option: Option) {
    onChange(option.id);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
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
  // With both kinds offered, expense matches come first; income ones say so.
  const showIncomeMarker = !kind;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${ids}-input`}>{label}</Label>
      <Input
        ref={inputRef}
        id={`${ids}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? optionId(active) : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder="Type to search"
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
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          // In the flow, not floating: inside dialogs a floating list would cover the action buttons.
          className="max-h-60 w-full overflow-auto rounded-md border border-border bg-background py-1"
        >
          {options.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No matching categories</li>}
          {options.map((option, i) => (
            <li
              key={option.id ?? "none"}
              id={optionId(i)}
              role="option"
              aria-selected={option.id === value}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${i === active ? "bg-muted" : ""}`}
            >
              {option.label}
              {showIncomeMarker && option.kind === "income" && (
                <span className="text-muted-foreground"> · Income</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {askStart && (
        <StartCategoriesDialog
          onDone={() => {
            startedHere.current = true;
            setAskStart(false);
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
