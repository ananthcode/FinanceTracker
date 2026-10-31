"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog } from "@/components/Dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api/client";

type Action = "load" | "reset" | "reset_and_load";
type Counts = Record<string, number>;

const WORD = "RESET";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** "8 accounts, 78 categories, …" from the server's counts (loaded: by entity; removed: by table). */
function describe(counts: Counts, kind: "loaded" | "removed"): string {
  const n = (k: string) => counts[k] ?? 0;
  const parts =
    kind === "loaded"
      ? [
          plural(n("account"), "account", "accounts"),
          plural(n("category"), "category", "categories"),
          plural(n("payee"), "payee or person", "payees and people"),
          plural(n("tag"), "tag", "tags"),
          plural(n("person_rate"), "interest rate", "interest rates"),
          plural(n("transaction"), "transaction", "transactions"),
        ]
      : [
          plural(n("accounts"), "account", "accounts"),
          plural(n("categories"), "category", "categories"),
          plural(n("payees"), "payee or person", "payees and people"),
          plural(n("tags"), "tag", "tags"),
          plural(n("transactions"), "transaction", "transactions"),
        ];
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * Settings › Your data (R5; FR-001, FR-005, FR-007 – FR-009, FR-013): load the demo household into
 * empty data, reset (permanently clear) your own data, or both. Resetting asks for the word RESET.
 * Outcomes are stated in words; every screen shows the new state at once (the page refreshes).
 */
export function YourData({ empty: serverEmpty, demoAvailable }: { empty: boolean; demoAvailable: boolean }) {
  const ids = useId();
  const router = useRouter();
  // What the last action left, shown at once; the server's answer takes over on the next render.
  const [afterAction, setAfterAction] = useState<{ empty: boolean; from: boolean } | null>(null);
  const empty = afterAction && afterAction.from === serverEmpty ? afterAction.empty : serverEmpty;
  const [asking, setAsking] = useState<Action | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  function ask(action: Action) {
    setTyped("");
    setOutcome(null);
    setAsking(action);
  }

  async function run(action: Action) {
    setBusy(true);
    const res = await apiFetch<{ loaded?: Counts; removed?: Counts }>("/api/me/data", {
      body: action === "load" ? { action } : { action, confirm: WORD },
    });
    setBusy(false);
    setAsking(null);
    if (!res.ok || !res.data) {
      setOutcome({ ok: false, text: res.error?.message ?? "That did not work. Please try again." });
      return;
    }
    const { loaded, removed } = res.data;
    const text =
      action === "load"
        ? `Demo data loaded: ${describe(loaded ?? {}, "loaded")}.`
        : action === "reset"
          ? `Your data was reset: ${describe(removed ?? {}, "removed")} removed.`
          : `Your data was replaced with fresh demo data: ${describe(loaded ?? {}, "loaded")}.`;
    setOutcome({ ok: true, text });
    setAfterAction({ empty: action === "reset", from: serverEmpty });
    router.refresh();
  }

  const resetDialog = asking === "reset" || asking === "reset_and_load";

  return (
    <section aria-labelledby={`${ids}-title`} className="flex flex-col gap-3">
      <h2 id={`${ids}-title`} className="text-lg font-medium">
        Your data
      </h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        {demoAvailable
          ? "Demo data is a made-up household — accounts, categories, people and about two years of transactions — for trying every screen. It is added to your own data, and you can reset it at any time."
          : "Reset removes everything you have recorded, so you can start again."}
      </p>
      {outcome && (
        <Alert variant={outcome.ok ? "default" : "destructive"} role={outcome.ok ? "status" : "alert"}>
          <AlertDescription>{outcome.text}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {empty && demoAvailable && (
          <Button type="button" onClick={() => ask("load")} disabled={busy}>
            Load demo data
          </Button>
        )}
        {!empty && demoAvailable && (
          <Button type="button" variant="outline" onClick={() => ask("reset_and_load")} disabled={busy}>
            Reset and load demo data
          </Button>
        )}
        {!empty && (
          <Button type="button" variant="destructive" onClick={() => ask("reset")} disabled={busy}>
            Reset my data
          </Button>
        )}
      </div>
      {empty && !demoAvailable && <p className="text-sm text-muted-foreground">You have no records yet.</p>}

      {asking === "load" && (
        <ConfirmDialog title="Load demo data?" confirmLabel="Load demo data" busy={busy} onConfirm={() => void run("load")} onCancel={() => setAsking(null)}>
          The demo household is added to your own data. It takes a few seconds.
        </ConfirmDialog>
      )}
      {resetDialog && (
        <Dialog title={asking === "reset" ? "Reset your data?" : "Reset and load demo data?"} onClose={() => setAsking(null)}>
          <form
            className="flex flex-col gap-4 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed === WORD) void run(asking);
            }}
          >
            <p>
              This permanently removes your accounts, account groups, categories, tags, payees and people, transactions, interest
              settings and rates, and their history. It cannot be undone.
              {asking === "reset_and_load" && " Then a fresh copy of the demo household is added."}
            </p>
            <p>Your sign-in, profile and preferences stay.</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-word`}>Type {WORD} to confirm</Label>
              <Input id={`${ids}-word`} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAsking(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={busy || typed !== WORD}>
                {asking === "reset" ? "Reset my data" : "Reset and load"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
