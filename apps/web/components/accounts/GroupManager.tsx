"use client";

import { useId, useState } from "react";
import { keyBetween, type ChangeResult, type GroupView } from "@ft/core";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changes, useSyncPush } from "@/lib/sync-client";
import { SortableList } from "./SortableList";

const MESSAGES: Partial<Record<NonNullable<ChangeResult["code"]>, string>> = {
  GROUP_NAME_TAKEN: "You already have a group with this name.",
  LIMIT_REACHED: "You can have up to 30 groups.",
  NOT_FOUND: "This group no longer exists.",
};

function nameError(name: string): string | null {
  const length = [...name.trim()].length;
  if (length < 1) return "Enter a name.";
  if (length > 30) return "Use at most 30 characters.";
  return null;
}

/** Create, rename, reorder and delete the user's own groups (FR-009a, FR-009b). */
export function GroupManager({ groups }: { groups: GroupView[] }) {
  const ids = useId();
  const push = useSyncPush();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const problem = nameError(name);
    if (problem) return setError(problem);
    setBusy(true);
    const submitted = name;
    const last = groups.at(-1)?.sortKey ?? null;
    const outcome = await push([changes.createGroup(crypto.randomUUID(), { name: submitted.trim(), sortKey: keyBetween(last, null) })]);
    setBusy(false);
    const result = outcome.ok ? outcome.results[0] : null;
    if (!outcome.ok) return setError(outcome.error.message);
    if (result?.status === "rejected") return setError((result.code && MESSAGES[result.code]) ?? "The group could not be added.");
    // Clear the box only if the user has not started typing the next name meanwhile.
    setName((current) => (current === submitted ? "" : current));
    setError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={add} noValidate className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-new`}>New group name</Label>
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
            Add group
          </Button>
        </div>
        {error && (
          <p id={`${ids}-new-error`} className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
      </form>

      {groups.length === 0 ? (
        <p className="text-muted-foreground">No groups yet.</p>
      ) : (
        <SortableList
          entity="account_group"
          ariaLabel="Your groups"
          items={groups.map((g) => ({ id: g.id, sortKey: g.sortKey, label: g.name, content: <GroupRow group={g} /> }))}
        />
      )}
    </div>
  );
}

function GroupRow({ group }: { group: GroupView }) {
  const ids = useId();
  const push = useSyncPush();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    const problem = nameError(name);
    if (problem) return setError(problem);
    if (name.trim() === group.name) return setEditing(false);
    setBusy(true);
    const outcome = await push([changes.updateGroup(group.id, { name: name.trim() })]);
    setBusy(false);
    const result = outcome.ok ? outcome.results[0] : null;
    if (!outcome.ok) return setError(outcome.error.message);
    if (result?.status === "rejected") return setError((result.code && MESSAGES[result.code]) ?? "The group could not be renamed.");
    setEditing(false);
    setError(null);
  }

  async function remove() {
    setBusy(true);
    await push([changes.deleteGroup(group.id)]);
    setBusy(false);
    setConfirmDelete(false);
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 py-2">
      {editing ? (
        <form onSubmit={rename} noValidate className="flex flex-1 flex-col gap-1">
          <div className="flex gap-2">
            <Label htmlFor={`${ids}-name`} className="sr-only">
              Name for {group.name}
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
                setName(group.name);
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
          <span className="flex-1 truncate font-medium">{group.name}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Rename ${group.name}`}>
            Rename
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${group.name}`}>
            Delete
          </Button>
        </>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete the group ${group.name}?`}
          confirmLabel="Delete group"
          destructive
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void remove()}
        >
          <p>Its accounts move to &ldquo;Ungrouped&rdquo;. No account or balance changes.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
