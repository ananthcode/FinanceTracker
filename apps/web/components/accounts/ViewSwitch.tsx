"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AccountsView } from "@ft/core";
import { apiFetch } from "@/lib/api/client";

const OPTIONS: { value: AccountsView; label: string }[] = [
  { value: "by_type", label: "By type" },
  { value: "my_groups", label: "My groups" },
];

/**
 * "By type" / "My groups" (FR-009). The choice is a preference, so it follows the user to every
 * device. Switching views never changes Owned, Owed or Net worth (FR-017).
 */
export function ViewSwitch({ view }: { view: AccountsView }) {
  const router = useRouter();
  const [selected, setSelected] = useState(view);
  const [error, setError] = useState(false);

  async function choose(next: AccountsView) {
    setSelected(next);
    setError(false);
    const res = await apiFetch("/api/me/preferences", { method: "PATCH", body: { accountsView: next } });
    if (!res.ok) {
      setSelected(view);
      setError(true);
      return;
    }
    router.refresh();
  }

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">Show accounts</legend>
      <div className="inline-flex rounded-lg border border-border p-0.5">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="relative cursor-pointer rounded-md px-3 py-1 text-sm has-checked:bg-brand/10 has-checked:font-semibold has-checked:text-brand-strong has-focus-visible:outline-2 has-focus-visible:outline-brand dark:has-checked:text-brand"
          >
            <input
              type="radio"
              name="accounts-view"
              value={o.value}
              checked={selected === o.value}
              onChange={() => void choose(o.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
            {o.label}
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          The view could not be changed. Please try again.
        </p>
      )}
    </fieldset>
  );
}
