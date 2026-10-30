"use client";

import { useId, useState } from "react";
import { compareNames, type TagView } from "@ft/core";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changes, useSyncPush } from "@/lib/sync-client";
import { refusal } from "./messages";

const TAG_MESSAGES = {
  NAME_TAKEN: "You already have a tag with this name.",
  LIMIT_REACHED: "You can have up to 500 tags. Merge or delete tags you no longer use.",
};

function nameError(name: string): string | null {
  const length = [...name.trim()].length;
  if (length < 1) return "Enter a name.";
  if (length > 30) return "Use at most 30 characters.";
  return null;
}

/**
 * Settings › Tags (R3 US4; FR-009 – FR-011): alphabetical list; add, rename in place, merge into
 * another tag, delete with confirmation. Records carrying tags arrive with transactions in R4.
 */
export function TagList({ tags }: { tags: TagView[] }) {
  const ids = useId();
  const push = useSyncPush();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sorted = [...tags].sort((a, b) => compareNames(a.name, b.name));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const problem = nameError(name);
    if (problem) return setError(problem);
    setBusy(true);
    const submitted = name;
    const outcome = await push([changes.createTag(crypto.randomUUID(), submitted.trim())]);
    setBusy(false);
    const refused = refusal(outcome, "The tag could not be added.", TAG_MESSAGES);
    if (refused) return setError(refused);
    setName((current) => (current === submitted ? "" : current));
    setError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={add} noValidate className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-new`}>New tag</Label>
        <div className="flex gap-2">
          <Input
            id={`${ids}-new`}
            value={name}
            maxLength={30}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? `${ids}-new-error` : undefined}
          />
          <Button type="submit" disabled={busy}>
            Add tag
          </Button>
        </div>
        {error && (
          <p id={`${ids}-new-error`} className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
      </form>

      {sorted.length === 0 ? (
        <p className="text-muted-foreground">No tags yet. Tags label transactions across categories — for example a trip or a festival.</p>
      ) : (
        <ul aria-label="Tags" className="flex flex-col divide-y divide-border">
          {sorted.map((t) => (
            <li key={t.id} data-tag-name={t.name}>
              <TagRow tag={t} others={sorted.filter((o) => o.id !== t.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TagRow({ tag, others }: { tag: TagView; others: TagView[] }) {
  const ids = useId();
  const push = useSyncPush();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"delete" | "merge" | null>(null);
  const [target, setTarget] = useState(others[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    const problem = nameError(name);
    if (problem) return setError(problem);
    if (name.trim() === tag.name) return setEditing(false);
    setBusy(true);
    const outcome = await push([changes.renameTag(tag.id, name.trim())]);
    setBusy(false);
    const refused = refusal(outcome, "The tag could not be renamed.", TAG_MESSAGES);
    if (refused) return setError(refused);
    setEditing(false);
    setError(null);
  }

  async function remove() {
    setBusy(true);
    await push([changes.deleteTag(tag.id)]);
    setBusy(false);
    setPanel(null);
  }

  async function merge(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    const outcome = await push([changes.mergeTag(tag.id, target)]);
    setBusy(false);
    const refused = refusal(outcome, "The tags could not be merged.");
    if (refused) return setError(refused);
    setPanel(null);
  }

  const targetName = others.find((o) => o.id === target)?.name ?? "";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 py-2">
      {editing ? (
        <form onSubmit={rename} noValidate className="flex flex-1 flex-col gap-1">
          <div className="flex gap-2">
            <Label htmlFor={`${ids}-name`} className="sr-only">
              New name for {tag.name}
            </Label>
            <Input
              id={`${ids}-name`}
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? `${ids}-error` : undefined}
              autoFocus
            />
            <Button type="submit" size="sm" disabled={busy}>
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setName(tag.name);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          {error && (
            <p id={`${ids}-error`} className="text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1 break-words font-medium">{tag.name}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Rename ${tag.name}`}>
            Rename
          </Button>
          {others.length > 0 && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setPanel("merge")} aria-label={`Merge ${tag.name}`}>
              Merge
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setPanel("delete")} aria-label={`Delete ${tag.name}`}>
            Delete
          </Button>
        </>
      )}

      {panel === "delete" && (
        <ConfirmDialog
          title={`Delete the tag ${tag.name}?`}
          confirmLabel="Delete tag"
          destructive
          busy={busy}
          onCancel={() => setPanel(null)}
          onConfirm={() => void remove()}
        >
          {/* R4 replaces this with the number of transactions that carry the tag (FR-010). */}
          <p>No transactions use this tag yet. It is removed from your list.</p>
        </ConfirmDialog>
      )}
      {panel === "merge" && (
        <Dialog title={`Merge ${tag.name} into another tag`} onClose={() => setPanel(null)}>
          <form onSubmit={merge} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-target`}>Merge into</Label>
              <select
                id={`${ids}-target`}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm">
              Everything labelled {tag.name} will be labelled {targetName} instead, and {tag.name} disappears. This
              can&rsquo;t be undone.
            </p>
            {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPanel(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Merge
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
