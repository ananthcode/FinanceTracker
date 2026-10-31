"use client";

import { useId, useState } from "react";
import {
  compareNames,
  TRANSACTION_STATUS_TEXT,
  TRANSACTION_STATUSES,
  type CategoryView,
  type ChangeInput,
  type PayeeView,
  type TagView,
  type TransactionView,
} from "@ft/core";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { changes, useSyncPush } from "@/lib/sync-client";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";
const CHUNK = 100;
const MAX_TAGS = 20;

type Action = "category" | "payee" | "status" | "addTag" | "removeTag";

const categorised = (tx: TransactionView) => tx.kind === "expense" || tx.kind === "income" || tx.kind === "refund";

/**
 * Change many selected transactions in one step (R4 FR-018, US6 3, 5): set the category, payee or
 * status, add or remove a tag, or delete them. Each becomes its own change (so each is in the
 * history), pushed in chunks of 100. A change that does not fit a transaction — a category of the
 * other kind, a split, a transfer's payee — skips it, and the result says how many.
 */
export function BulkBar({
  selected,
  categoryPaths,
  categories,
  payees,
  tags,
  onDone,
}: {
  selected: TransactionView[];
  categoryPaths: [string, string][];
  categories: CategoryView[];
  payees: PayeeView[];
  tags: TagView[];
  /** Called with the outcome when a change has run; the list clears the selection and shows it. */
  onDone: (result: { ok: boolean; text: string }) => void;
}) {
  const ids = useId();
  const push = useSyncPush();
  const [action, setAction] = useState<Action>("category");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]));

  /** The change for one transaction, or null when it does not apply to it. */
  function changeFor(tx: TransactionView): ChangeInput | null {
    switch (action) {
      case "category": {
        if (!categorised(tx) || tx.lines.length > 0) return null;
        const wanted = tx.kind === "income" ? "income" : "expense";
        if (kindOf.get(value) !== wanted || tx.categoryId === value) return null;
        return changes.updateTransaction(tx.id, { categoryId: value });
      }
      case "payee":
        if (!categorised(tx) || tx.payeeId === value) return null;
        return changes.updateTransaction(tx.id, { payeeId: value });
      case "status":
        return tx.status === value ? null : changes.updateTransaction(tx.id, { status: value });
      case "addTag":
        if (tx.tagIds.includes(value) || tx.tagIds.length >= MAX_TAGS) return null;
        return changes.updateTransaction(tx.id, { tagIds: [...tx.tagIds, value] });
      case "removeTag":
        return tx.tagIds.includes(value) ? changes.updateTransaction(tx.id, { tagIds: tx.tagIds.filter((t) => t !== value) }) : null;
    }
  }

  async function run(list: ChangeInput[], skipped: number, verb: string) {
    setBusy(true);
    setMessage(null);
    let done = 0;
    let refused = 0;
    for (let i = 0; i < list.length; i += CHUNK) {
      const outcome = await push(list.slice(i, i + CHUNK));
      if (!outcome.ok) {
        setBusy(false);
        return setMessage({ ok: false, text: `${outcome.error.message} ${done} were ${verb} before it stopped.` });
      }
      for (const r of outcome.results) {
        if (r.status === "rejected") refused += 1;
        else done += 1;
      }
    }
    setBusy(false);
    const parts = [`${done} ${verb}`];
    if (skipped > 0) parts.push(`${skipped} skipped (the change does not fit them)`);
    if (refused > 0) parts.push(`${refused} could not be changed`);
    onDone({ ok: refused === 0, text: `${parts.join("; ")}.` });
  }

  function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!value) return setMessage({ ok: false, text: "Choose what to set." });
    const list = selected.map(changeFor).filter((c): c is ChangeInput => c !== null);
    void run(list, selected.length - list.length, "changed");
  }

  const options: [string, string][] =
    action === "category"
      ? categoryPaths
      : action === "payee"
        ? payees.filter((p) => !p.hidden).sort((a, b) => compareNames(a.name, b.name)).map((p) => [p.id, p.name])
        : action === "status"
          ? TRANSACTION_STATUSES.map((s) => [s, TRANSACTION_STATUS_TEXT[s]])
          : [...tags].sort((a, b) => compareNames(a.name, b.name)).map((t) => [t.id, t.name]);

  return (
    <section aria-label="Change selected transactions" className="sticky bottom-0 z-10 flex flex-col gap-2 rounded-lg border border-border bg-background p-3 shadow-sm">
      <form onSubmit={apply} className="flex flex-wrap items-end gap-2">
        <p className="mr-2 self-center text-sm font-medium">{selected.length} selected</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-action`}>Change</Label>
          <select
            id={`${ids}-action`}
            className={selectClass}
            value={action}
            onChange={(e) => {
              setAction(e.target.value as Action);
              setValue("");
            }}
          >
            <option value="category">Set category</option>
            <option value="payee">Set payee</option>
            <option value="status">Set status</option>
            <option value="addTag">Add tag</option>
            <option value="removeTag">Remove tag</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-value`}>To</Label>
          <select id={`${ids}-value`} className={selectClass} value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">Choose…</option>
            {options.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={busy}>
          Apply
        </Button>
        <Button type="button" variant="destructive" className="ml-auto" disabled={busy} onClick={() => setConfirmDelete(true)}>
          Delete selected
        </Button>
      </form>
      {message && (
        <Alert variant={message.ok ? "default" : "destructive"} role={message.ok ? "status" : "alert"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${selected.length === 1 ? "1 transaction" : `${selected.length} transactions`}?`}
          confirmLabel="Delete"
          destructive
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void run(selected.map((tx) => changes.deleteTransaction(tx.id)), 0, "deleted");
          }}
        >
          They leave every screen and balance. Their history is kept.
        </ConfirmDialog>
      )}
    </section>
  );
}
