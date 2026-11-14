"use client";

import Link from "next/link";
import { useState } from "react";
import { keyBetween, type TemplateView } from "@ft/core";
import { Money } from "@/components/Money";
import { Button, buttonVariants } from "@/components/ui/button";
import { changes, useSyncPush } from "@/lib/sync-client";

/**
 * Manage templates (R8 US2 3, 5; FR-004): every live template in the user's order, with Move up, Move
 * down and Move to top (buttons, so it works by keyboard), Hide / Show and Edit. Moving one writes a
 * single order key on that template (research R8-02).
 */
export function ManageTemplates({ templates, currency }: { templates: TemplateView[]; currency: string }) {
  const push = useSyncPush();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(change: Parameters<typeof push>[0][number]) {
    setBusy(true);
    const outcome = await push([change]);
    setBusy(false);
    if (!outcome.ok || outcome.results[0]?.status === "rejected") setError("That could not be saved. Refresh and try again.");
    else setError(null);
  }

  /** The key that puts template `i` at position `to` (0-based) among the others. */
  function moveTo(i: number, to: number) {
    const others = templates.filter((_, n) => n !== i);
    const before = to > 0 ? others[to - 1]!.sortKey : null;
    const after = to < others.length ? others[to]!.sortKey : null;
    void send(changes.updateTemplate(templates[i]!.id, { sortKey: keyBetween(before, after) }));
  }

  if (templates.length === 0) {
    return <p className="text-muted-foreground">No templates yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <ol aria-label="Templates in order" className="flex flex-col">
        {templates.map((t, i) => (
          <li key={t.id} data-manage-template={t.name} className="flex flex-wrap items-center gap-2 border-t border-border py-2 first:border-t-0">
            <span className="min-w-40 flex-1">
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 text-sm text-muted-foreground">
                {t.amountMinor === null ? "Amount each time" : <Money value={t.amountMinor} currency={currency} />}
                {t.hidden && " · hidden"}
              </span>
            </span>
            <Button type="button" size="sm" variant="outline" disabled={busy || i === 0} onClick={() => moveTo(i, i - 1)}>
              Move up<span className="sr-only"> {t.name}</span>
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy || i === templates.length - 1} onClick={() => moveTo(i, i + 1)}>
              Move down<span className="sr-only"> {t.name}</span>
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy || i === 0} onClick={() => moveTo(i, 0)}>
              Move to top<span className="sr-only"> {t.name}</span>
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void send(changes.updateTemplate(t.id, { hidden: !t.hidden }))}>
              {t.hidden ? "Show" : "Hide"}
              <span className="sr-only"> {t.name}</span>
            </Button>
            <Link href={`/templates/${t.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
              Edit<span className="sr-only"> {t.name}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
