"use client";

import { useMemo, useState } from "react";
import {
  canDeleteCategory,
  canMergeCategory,
  categoryPath,
  indexCategories,
  mergePreview,
  subtreeIds,
  type CategoriesStart,
  type CategoryView,
  type PayeeView,
} from "@ft/core";
import { Button } from "@/components/ui/button";
import { changes, useSyncPush } from "@/lib/sync-client";
import { CategoryPicker } from "./CategoryPicker";
import { refusal } from "./messages";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The actions for one category, shown in its Manage panel (R3 US1, US5): add a sub-category,
 * edit, move, hide or unhide, merge into another category (with a preview of what moves) and delete
 * (only a leaf nothing has used; otherwise it explains and suggests hiding or merging).
 */
export function CategoryActions({
  category,
  categories,
  categoriesStart,
  payees,
  onAddChild,
  onEdit,
  onMove,
  onClose,
}: {
  category: CategoryView;
  categories: CategoryView[];
  categoriesStart: CategoriesStart | null;
  payees: PayeeView[];
  onAddChild: () => void;
  onEdit: () => void;
  onMove: () => void;
  onClose: () => void;
}) {
  const push = useSyncPush();
  const [view, setView] = useState<"menu" | "merge" | "delete">("menu");
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const index = useMemo(() => indexCategories(categories), [categories]);
  const excluded = useMemo(() => subtreeIds(categories, category.id), [categories, category.id]);
  const deletable = canDeleteCategory(categories, payees, category.id);

  async function run(change: Parameters<typeof push>[0][number], fallback: string) {
    setBusy(true);
    const outcome = await push([change]);
    setBusy(false);
    const problem = refusal(outcome, fallback);
    if (problem) return setError(problem);
    onClose();
  }

  if (view === "merge") {
    const preview = target && canMergeCategory(categories, category.id, target).ok ? mergePreview(categories, payees, category.id, target) : null;
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (target) void run(changes.mergeCategory(category.id, target), "The categories could not be merged.");
        }}
      >
        <CategoryPicker
          label="Merge into"
          categories={categories}
          value={target}
          onChange={setTarget}
          kind={category.kind}
          categoriesStart={categoriesStart}
          exclude={excluded}
        />
        {preview && target && (
          <div className="flex flex-col gap-1 text-sm" aria-live="polite">
            <p>
              Everything that uses {category.name} will use {categoryPath(target, index)} instead, and {category.name}{" "}
              disappears. This can&rsquo;t be undone.
            </p>
            <ul className="list-disc pl-5">
              {preview.moved.length > 0 && <li>Moves: {preview.moved.join(", ")}</li>}
              {preview.merged.map((m) => (
                <li key={`${m.from}>${m.into}`}>
                  {m.from} merges into {m.into}
                </li>
              ))}
              {preview.payeeDefaults > 0 && <li>{plural(preview.payeeDefaults, "payee", "payees")} get a new default category</li>}
            </ul>
          </div>
        )}
        {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setView("menu")}>
            Back
          </Button>
          <Button type="submit" disabled={busy || !preview}>
            Merge
          </Button>
        </div>
      </form>
    );
  }

  if (view === "delete") {
    return (
      <div className="flex flex-col gap-4 text-sm">
        {deletable.ok ? (
          <>
            <p>
              Delete {category.name}? It disappears from every screen.
              {deletable.payeeDefaults > 0 &&
                ` ${plural(deletable.payeeDefaults, "payee loses", "payees lose")} it as their default category.`}
            </p>
            {error && <p className="text-red-700 dark:text-red-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setView("menu")}>
                Back
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void run(changes.deleteCategory(category.id), "The category could not be deleted.")}
              >
                Delete category
              </Button>
            </div>
          </>
        ) : (
          <>
            <p>
              {category.name} has sub-categories, so it can&rsquo;t be deleted. Delete or move them first — or hide{" "}
              {category.name}, or merge it into another category.
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => setView("menu")}>
                Back
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" onClick={onAddChild}>
        Add sub-category
      </Button>
      <Button type="button" variant="outline" onClick={onEdit}>
        Edit name, colour or icon
      </Button>
      <Button type="button" variant="outline" onClick={onMove}>
        Move
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() =>
          void run(changes.updateCategory(category.id, { hidden: !category.hidden }), "The category could not be changed.")
        }
      >
        {category.hidden ? "Unhide" : "Hide"}
      </Button>
      <Button type="button" variant="outline" onClick={() => setView("merge")}>
        Merge into another category
      </Button>
      <Button type="button" variant="outline" onClick={() => setView("delete")}>
        Delete
      </Button>
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Hidden categories are not offered for new entries but stay on records that already use them.
      </p>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
