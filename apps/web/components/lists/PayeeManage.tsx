"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { canMergePayee, compareNames, mergedOpeningBalance, type PayeeView } from "@ft/core";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { changes, useSyncPush } from "@/lib/sync-client";
import { refusal } from "./messages";
import { PersonBalance } from "./PersonBalance";

/**
 * "Manage" actions for a payee or person (R3 US5; FR-022, FR-024, FR-025): hide or unhide, merge
 * into another payee of the same kind, and delete one nothing has used.
 */
export function PayeeManage({ payee, payees, returnTo }: { payee: PayeeView; payees: PayeeView[]; returnTo: string }) {
  const ids = useId();
  const router = useRouter();
  const push = useSyncPush();
  const targets = payees.filter((p) => canMergePayee(payee, p)).sort((a, b) => compareNames(a.name, b.name));
  const [panel, setPanel] = useState<"merge" | "relocate" | "delete" | null>(null);
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const noun = payee.kind === "person" ? "person" : "payee";

  async function run(change: Parameters<typeof push>[0][number], fallback: string, leave: boolean) {
    setBusy(true);
    const outcome = await push([change]);
    setBusy(false);
    const problem = refusal(outcome, fallback);
    if (problem) return setError(problem);
    setPanel(null);
    if (leave) router.push(returnTo);
  }

  const chosen = targets.find((t) => t.id === target);

  return (
    <section aria-labelledby={`${ids}-title`} className="flex max-w-xl flex-col gap-2 border-t border-border pt-4">
      <h2 id={`${ids}-title`} className="text-lg font-medium">
        Manage {noun}
      </h2>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void run(changes.updatePayee(payee.id, { hidden: !payee.hidden }), `The ${noun} could not be changed.`, false)}
        >
          {payee.hidden ? "Unhide" : "Hide"}
        </Button>
        {targets.length > 0 && (
          <Button type="button" variant="outline" onClick={() => setPanel("merge")}>
            Merge into another {noun}
          </Button>
        )}
        {targets.length > 0 && (
          <Button type="button" variant="outline" onClick={() => setPanel("relocate")}>
            Relocate transactions to another {noun}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => setPanel("delete")}>
          Delete
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {payee.hidden
          ? `This ${noun} is hidden: not offered for new entries, but kept on existing ones.`
          : `Hiding keeps this ${noun} on existing records but stops offering it for new entries.`}
      </p>
      {error && !panel && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}

      {panel === "delete" && (
        <ConfirmDialog
          title={`Delete ${payee.name}?`}
          confirmLabel={`Delete ${noun}`}
          destructive
          busy={busy}
          onCancel={() => setPanel(null)}
          onConfirm={() => void run(changes.deletePayee(payee.id), `The ${noun} could not be deleted.`, true)}
        >
          <p>
            {payee.name} disappears from every screen.
            {payee.kind === "person" && payee.openingBalanceMinor !== 0n && " Their balance goes with them."}
          </p>
          {error && <p className="text-red-700 dark:text-red-300">{error}</p>}
        </ConfirmDialog>
      )}
      {panel === "relocate" && (
        // R4 FR-019: everything moves to the target; this payee stays.
        <Dialog title={`Move ${payee.name}'s transactions`} onClose={() => setPanel(null)}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (target) void run(changes.relocatePayee(payee.id, target), "The transactions could not be moved.", false);
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-relocate`}>Move them to</Label>
              <select
                id={`${ids}-relocate`}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            {chosen && (
              <p className="text-sm" aria-live="polite">
                Every transaction with {payee.name} will be with {chosen.name} instead. {payee.name} stays.
              </p>
            )}
            {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPanel(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !chosen}>
                Move transactions
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {panel === "merge" && (
        <Dialog title={`Merge ${payee.name} into another ${noun}`} onClose={() => setPanel(null)}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (target) void run(changes.mergePayee(payee.id, target), `The ${noun}s could not be merged.`, true);
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-target`}>Merge into</Label>
              <select
                id={`${ids}-target`}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            {chosen && (
              <div className="flex flex-col gap-1 text-sm" aria-live="polite">
                <p>
                  Everything that uses {payee.name} will use {chosen.name} instead, and {payee.name} disappears. This
                  can&rsquo;t be undone.
                </p>
                <ul className="list-disc pl-5">
                  <li>{chosen.name} keeps its name and default category.</li>
                  {payee.notes && <li>{payee.name}&rsquo;s notes are added to {chosen.name}&rsquo;s.</li>}
                  {payee.kind === "person" && (
                    <li>
                      Combined balance: <PersonBalance balance={mergedOpeningBalance(payee, chosen)} />
                    </li>
                  )}
                </ul>
              </div>
            )}
            {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPanel(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !chosen}>
                Merge
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
