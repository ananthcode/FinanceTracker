"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STATEMENT_SIGN_TEXT, STATEMENT_SIGNS, type StatementSign } from "@ft/core";
import { refusal } from "@/components/lists/messages";
import { changes, useSyncPush } from "@/lib/sync-client";

/** Which direction counts as positive for this person (R6 FR-010): a synced person field. */
export function StatementSignSetting({ personId, sign }: { personId: string; sign: StatementSign }) {
  const router = useRouter();
  const push = useSyncPush();
  // Shown at once; put back if the change is refused.
  const [current, setCurrent] = useState(sign);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: StatementSign) {
    setCurrent(next);
    setBusy(true);
    setError(null);
    const outcome = await push([changes.updatePayee(personId, { statementSign: next })]);
    setBusy(false);
    const problem = refusal(outcome, "The setting could not be saved. Please try again.");
    if (problem) {
      setCurrent(sign);
      setError(problem);
    } else {
      router.refresh();
    }
  }

  return (
    <fieldset className="flex flex-col gap-1" disabled={busy}>
      <legend className="mb-1 text-sm font-medium">Sign on this statement</legend>
      {STATEMENT_SIGNS.map((s) => (
        <label key={s} className="flex items-center gap-2 text-sm">
          <input type="radio" name="statement-sign" checked={current === s} onChange={() => choose(s)} />
          {STATEMENT_SIGN_TEXT[s]}
        </label>
      ))}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </fieldset>
  );
}
