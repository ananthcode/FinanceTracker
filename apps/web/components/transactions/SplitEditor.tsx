"use client";

import { useId } from "react";
import { formatAmountInput, parseAmountInput, type CategoriesStart, type CategoryKind, type CategoryView, type MoneyFlow, type PayeeView, type TagView } from "@ft/core";
import { Money } from "@/components/Money";
import { CategoryPicker } from "@/components/lists/CategoryPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PayeeCombobox, type PayeeChoice } from "./PayeeCombobox";
import { TagPicker } from "./TagPicker";

export const MAX_LINES = 50;

/** A split line as the form edits it; `amount` is the text typed. */
export interface SplitLineDraft {
  id: string;
  amount: string;
  share: "category" | "person";
  categoryId: string | null;
  person: PayeeChoice;
  notes: string;
  tagIds: string[];
}

export const emptyLine = (): SplitLineDraft => ({
  id: crypto.randomUUID(),
  amount: "",
  share: "category",
  categoryId: null,
  person: null,
  notes: "",
  tagIds: [],
});

/** The parsed total of the lines; lines whose amount is not valid count as zero. */
export function linesTotal(lines: readonly SplitLineDraft[], currency: string): bigint {
  return lines.reduce((sum, l) => {
    const parsed = parseAmountInput(l.amount, { currency });
    return parsed.ok ? sum + parsed.minor : sum;
  }, 0n);
}

/**
 * The split editor (R4 FR-012): 2–50 lines, each a category of the transaction's kind or a person
 * share (paid on behalf of when money goes out, collected on behalf of when it comes in), with
 * optional notes and tags. Shows what is left to allocate; the form refuses to save until it is zero.
 */
export function SplitEditor({
  lines,
  onChange,
  totalMinor,
  categoryKind,
  flow,
  categories,
  categoriesStart,
  payees,
  tags,
  createdTags,
  onCreatedTags,
  currency,
  lineErrors,
  onUnsplit,
}: {
  lines: SplitLineDraft[];
  onChange: (lines: SplitLineDraft[]) => void;
  /** The transaction amount, or null while it is not a valid amount. */
  totalMinor: bigint | null;
  categoryKind: CategoryKind;
  flow: MoneyFlow;
  categories: CategoryView[];
  categoriesStart: CategoriesStart | null;
  payees: PayeeView[];
  tags: TagView[];
  createdTags: TagView[];
  onCreatedTags: (created: TagView[]) => void;
  currency: string;
  lineErrors: Record<string, string>;
  onUnsplit: () => void;
}) {
  const ids = useId();
  const allocated = linesTotal(lines, currency);
  const left = totalMinor === null ? null : totalMinor - allocated;
  const personWords = flow === "out" ? "Paid on behalf of" : "Collected on behalf of";

  const update = (id: string, patch: Partial<SplitLineDraft>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">Split into lines</legend>
      <p role="status" aria-live="polite" className="text-sm font-medium">
        {left === null ? (
          "Enter the amount to split."
        ) : left === 0n ? (
          "Fully allocated."
        ) : left > 0n ? (
          <>
            <Money value={left} currency={currency} /> left to allocate
          </>
        ) : (
          <>
            <Money value={-left} currency={currency} /> more than the amount
          </>
        )}
      </p>
      <ol className="flex flex-col gap-4">
        {lines.map((line, i) => (
          <li key={line.id} className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0" aria-label={`Line ${i + 1}`}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex w-36 flex-col gap-1.5">
                <Label htmlFor={`${ids}-${line.id}-amount`}>Line {i + 1} amount</Label>
                <Input
                  id={`${ids}-${line.id}-amount`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={line.amount}
                  placeholder="0.00"
                  onChange={(e) => update(line.id, { amount: e.target.value })}
                  aria-invalid={!!lineErrors[line.id] || undefined}
                  aria-describedby={lineErrors[line.id] ? `${ids}-${line.id}-error` : undefined}
                />
              </div>
              <fieldset className="flex flex-wrap gap-3 text-sm">
                <legend className="sr-only">Line {i + 1} is</legend>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`${ids}-${line.id}-share`}
                    checked={line.share === "category"}
                    onChange={() => update(line.id, { share: "category", person: null })}
                  />
                  A category
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`${ids}-${line.id}-share`}
                    checked={line.share === "person"}
                    onChange={() => update(line.id, { share: "person", categoryId: null })}
                  />
                  {personWords} a person
                </label>
              </fieldset>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => (lines.length <= 2 ? onUnsplit() : onChange(lines.filter((l) => l.id !== line.id)))}
              >
                {lines.length <= 2 ? "Remove split" : `Remove line ${i + 1}`}
              </Button>
            </div>
            {lineErrors[line.id] && (
              <p id={`${ids}-${line.id}-error`} className="text-sm text-red-700 dark:text-red-300">
                {lineErrors[line.id]}
              </p>
            )}
            {line.share === "category" ? (
              <CategoryPicker
                label={`Line ${i + 1} category`}
                categories={categories}
                value={line.categoryId}
                onChange={(categoryId) => update(line.id, { categoryId })}
                kind={categoryKind}
                categoriesStart={categoriesStart}
                noneLabel="Uncategorised"
              />
            ) : (
              <PayeeCombobox
                label={`Line ${i + 1}: ${personWords.toLocaleLowerCase("en")}`}
                payees={payees}
                value={line.person}
                onChange={(person) => update(line.id, { person })}
                onlyPeople
              />
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-${line.id}-notes`}>Line {i + 1} notes (optional)</Label>
              <Input
                id={`${ids}-${line.id}-notes`}
                value={line.notes}
                maxLength={500}
                onChange={(e) => update(line.id, { notes: e.target.value })}
              />
            </div>
            <TagPicker
              label={`Line ${i + 1} tags (optional)`}
              tags={tags}
              value={line.tagIds}
              created={createdTags}
              onChange={(tagIds, created) => {
                update(line.id, { tagIds });
                onCreatedTags(created);
              }}
            />
          </li>
        ))}
      </ol>
      {lines.length < MAX_LINES && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            const line = emptyLine();
            if (left !== null && left > 0n) line.amount = formatAmountInput(left, currency);
            onChange([...lines, line]);
          }}
        >
          Add line
        </Button>
      )}
    </fieldset>
  );
}
