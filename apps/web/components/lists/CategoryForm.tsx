"use client";

import { useId, useState } from "react";
import type { CategoryKind, CategoryView } from "@ft/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changes, useSyncPush } from "@/lib/sync-client";
import { AppearancePicker } from "./AppearancePicker";
import { refusal } from "./messages";

const NEW_TOP_LEVEL: Record<CategoryKind, { colour: string; icon: string }> = {
  expense: { colour: "green", icon: "shopping-cart" },
  income: { colour: "teal", icon: "coins" },
};

/**
 * Add a category (top level or under a parent) or edit one's name, colour and icon (R3 FR-002,
 * FR-003, FR-006). A new sub-category starts with its parent's colour and icon.
 */
export function CategoryForm({
  mode,
  onDone,
  onCancel,
}: {
  mode: { type: "create"; kind: CategoryKind; parent: CategoryView | null } | { type: "edit"; category: CategoryView };
  onDone: () => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const push = useSyncPush();
  const initial =
    mode.type === "edit"
      ? mode.category
      : { name: "", ...(mode.parent ? { colour: mode.parent.colour, icon: mode.parent.icon } : NEW_TOP_LEVEL[mode.kind]) };
  const [name, setName] = useState(initial.name);
  const [appearance, setAppearance] = useState({ colour: initial.colour, icon: initial.icon });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const length = [...trimmed].length;
    if (length < 1) return setError("Enter a name.");
    if (length > 40) return setError("Use at most 40 characters.");

    let change;
    if (mode.type === "create") {
      change = changes.createCategory(crypto.randomUUID(), {
        name: trimmed,
        kind: mode.kind,
        parentId: mode.parent?.id ?? null,
        ...appearance,
      });
    } else {
      const changed: Record<string, unknown> = {};
      if (trimmed !== mode.category.name) changed.name = trimmed;
      if (appearance.colour !== mode.category.colour) changed.colour = appearance.colour;
      if (appearance.icon !== mode.category.icon) changed.icon = appearance.icon;
      if (Object.keys(changed).length === 0) return onDone();
      change = changes.updateCategory(mode.category.id, changed);
    }
    setBusy(true);
    const outcome = await push([change]);
    setBusy(false);
    const problem = refusal(outcome, "The category could not be saved.", {
      NAME_TAKEN: "A category with this name is already here. Names must be unique among sub-categories of the same parent.",
      LIMIT_REACHED: "You can have up to 500 categories.",
    });
    if (problem) return setError(problem);
    onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-name`}>Name</Label>
        <Input
          id={`${ids}-name`}
          value={name}
          maxLength={40}
          autoComplete="off"
          autoFocus
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${ids}-error` : undefined}
        />
        {error && (
          <p id={`${ids}-error`} className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
      </div>
      <AppearancePicker colour={appearance.colour} icon={appearance.icon} onChange={setAppearance} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {mode.type === "create" ? "Add category" : "Save"}
        </Button>
      </div>
    </form>
  );
}
