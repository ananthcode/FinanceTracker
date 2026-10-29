"use client";

import { useId, useMemo, useState } from "react";
import { canMoveCategory, subtreeIds, type CategoriesStart, type CategoryView } from "@ft/core";
import { Button } from "@/components/ui/button";
import { changes, useSyncPush } from "@/lib/sync-client";
import { CategoryPicker } from "./CategoryPicker";
import { refusal } from "./messages";

/**
 * Move a category, with everything beneath it, under another category of the same kind or to the
 * top level (R3 FR-006). Its own sub-categories are not offered; a same-named sibling is refused
 * with a suggestion to merge.
 */
export function MoveCategoryForm({
  category,
  categories,
  categoriesStart,
  onDone,
  onCancel,
}: {
  category: CategoryView;
  categories: CategoryView[];
  categoriesStart: CategoriesStart | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const push = useSyncPush();
  const [parentId, setParentId] = useState<string | null>(category.parentId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const exclude = useMemo(() => subtreeIds(categories, category.id), [categories, category.id]);
  const topLevel = category.kind === "expense" ? "Top level (Expense)" : "Top level (Income)";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (parentId === category.parentId) return onDone();
    const check = canMoveCategory(categories, category.id, parentId);
    if (!check.ok) {
      return setError(
        check.reason === "NAME_TAKEN"
          ? `There is already a category named ${category.name} there. Merge the two instead.`
          : "It can't be moved there.",
      );
    }
    setBusy(true);
    const outcome = await push([changes.updateCategory(category.id, { parentId })]);
    setBusy(false);
    const problem = refusal(outcome, "The category could not be moved.", {
      NAME_TAKEN: `There is already a category named ${category.name} there. Merge the two instead.`,
    });
    if (problem) return setError(problem);
    onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <CategoryPicker
        label="Move under"
        categories={categories}
        value={parentId}
        onChange={(id) => {
          setParentId(id);
          setError(null);
        }}
        kind={category.kind}
        categoriesStart={categoriesStart}
        exclude={exclude}
        noneLabel={topLevel}
        describedBy={error ? `${ids}-error` : undefined}
      />
      {error && (
        <p id={`${ids}-error`} className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Move
        </Button>
      </div>
    </form>
  );
}
