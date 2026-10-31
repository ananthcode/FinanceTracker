"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_CATEGORY_COUNT, type CategoriesStart } from "@ft/core";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";

/**
 * The one-time choice the first time categories are needed (R3 FR-007): start with the suggested
 * Indian categories (preselected) or start empty. The user must answer before using categories.
 */
export function StartCategoriesDialog({ onDone }: { onDone?: (choice: CategoriesStart) => void }) {
  const ids = useId();
  const router = useRouter();
  const [choice, setChoice] = useState<CategoriesStart>("suggested");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await apiFetch<{ choice: CategoriesStart; added: number }>("/api/categories/start", { body: { choice } });
    setBusy(false);
    if (!res.ok || !res.data) return setError(res.error?.message ?? "Something went wrong. Please try again.");
    router.refresh();
    onDone?.(res.data.choice);
  }

  return (
    <Dialog
      title="How would you like to start?"
      description="Categories sort your spending and income. You can rename, move, hide or delete any of them later."
      onClose={() => {}}
      required
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Categories to start with</legend>
          <label className="flex items-start gap-2 rounded-md border border-border p-3 has-[:checked]:border-foreground">
            <input
              type="radio"
              name={`${ids}-choice`}
              value="suggested"
              checked={choice === "suggested"}
              onChange={() => setChoice("suggested")}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">Start with suggested categories</span>
              <span className="block text-sm text-muted-foreground">
                {DEFAULT_CATEGORY_COUNT} common categories for an Indian household — groceries, rent, school fees, salary and
                more.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-md border border-border p-3 has-[:checked]:border-foreground">
            <input
              type="radio"
              name={`${ids}-choice`}
              value="empty"
              checked={choice === "empty"}
              onChange={() => setChoice("empty")}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">Start empty</span>
              <span className="block text-sm text-muted-foreground">Create your own categories from scratch.</span>
            </span>
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            Continue
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
