"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { changes, useSyncPush } from "@/lib/sync-client";

/** Restores an archived account from the "Archived accounts" list (FR-021, FR-023). */
export function RestoreButton({ id, name }: { id: string; name: string }) {
  const push = useSyncPush();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function restore() {
    setBusy(true);
    setFailed(false);
    const outcome = await push([changes.restoreAccount(id)]);
    setBusy(false);
    if (!outcome.ok || outcome.results[0]?.status === "rejected") setFailed(true);
  }

  return (
    <div className="flex shrink-0 flex-col items-end">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void restore()} aria-label={`Restore ${name}`}>
        Restore
      </Button>
      {failed && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          Could not restore. Try again.
        </p>
      )}
    </div>
  );
}
