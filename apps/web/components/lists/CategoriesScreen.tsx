"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildCategoryTree,
  categoryPath,
  flattenTree,
  indexCategories,
  searchCategories,
  type CategoriesStart,
  type CategoryKind,
  type CategoryNode,
  type CategoryView,
  type PayeeView,
} from "@ft/core";
import { AppIcon } from "@/components/AppIcon";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api/client";
import { CategoryForm } from "./CategoryForm";
import { CategoryActions } from "./CategoryActions";
import { MoveCategoryForm } from "./MoveCategoryForm";
import { StartCategoriesDialog } from "./StartCategoriesDialog";

type Panel =
  | { type: "add"; kind: CategoryKind; parent: CategoryView | null }
  | { type: "manage"; id: string }
  | { type: "edit"; id: string }
  | { type: "move"; id: string };

const KIND_TITLE: Record<CategoryKind, string> = { expense: "Expense", income: "Income" };

/**
 * Settings › Categories (R3 US1, US5): the start choice, the Expense and Income trees (alphabetical,
 * expand/collapse), search by any part of a name, and a Manage panel per category.
 */
export function CategoriesScreen({
  categories,
  categoriesStart,
  payees,
}: {
  categories: CategoryView[];
  categoriesStart: CategoriesStart | null;
  payees: PayeeView[];
}) {
  const ids = useId();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<Panel | null>(null);
  const [addingSuggested, setAddingSuggested] = useState(false);

  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const index = useMemo(() => indexCategories(categories), [categories]);
  const matches = useMemo(
    () => (query.trim() ? searchCategories(query, categories, { includeHidden: true }) : []),
    [query, categories],
  );

  const close = () => setPanel(null);
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setAll = (kind: CategoryKind, open: boolean) =>
    setExpanded((current) => {
      const next = new Set(current);
      for (const node of flattenTree(tree[kind])) {
        if (node.children.length === 0) continue;
        if (open) next.add(node.id);
        else next.delete(node.id);
      }
      return next;
    });

  async function addSuggested() {
    setAddingSuggested(true);
    await apiFetch("/api/categories/start", { body: { choice: "suggested" } });
    setAddingSuggested(false);
    router.refresh();
  }

  const current = panel && panel.type !== "add" ? index.get(panel.id) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {categoriesStart === null && <StartCategoriesDialog />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-search`}>Search categories</Label>
        <Input
          id={`${ids}-search`}
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Type part of a name"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {query.trim() ? (
        <section aria-labelledby={`${ids}-results`} className="flex flex-col gap-2">
          <h2 id={`${ids}-results`} className="text-lg font-medium">
            Matching categories
          </h2>
          {matches.length === 0 ? (
            <p className="text-muted-foreground">No category matches &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {matches.map((m) => (
                <li key={m.category.id}>
                  <CategoryRow node={m.category} label={m.path} onManage={() => setPanel({ type: "manage", id: m.category.id })} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        (["expense", "income"] as const).map((kind) => (
          <section key={kind} aria-labelledby={`${ids}-${kind}`} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`${ids}-${kind}`} className="mr-auto text-lg font-medium">
                {KIND_TITLE[kind]}
              </h2>
              {tree[kind].some((n) => n.children.length > 0) && (
                <>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAll(kind, true)}>
                    Expand all<span className="sr-only"> {KIND_TITLE[kind].toLowerCase()} categories</span>
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAll(kind, false)}>
                    Collapse all<span className="sr-only"> {KIND_TITLE[kind].toLowerCase()} categories</span>
                  </Button>
                </>
              )}
              <Button type="button" size="sm" variant="outline" onClick={() => setPanel({ type: "add", kind, parent: null })}>
                Add {KIND_TITLE[kind].toLowerCase()} category
              </Button>
            </div>
            {tree[kind].length === 0 ? (
              <p className="text-muted-foreground">No {KIND_TITLE[kind].toLowerCase()} categories yet.</p>
            ) : (
              <Tree nodes={tree[kind]} expanded={expanded} onToggle={toggle} onManage={(id) => setPanel({ type: "manage", id })} />
            )}
          </section>
        ))
      )}

      {categoriesStart !== null && categories.length === 0 && (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border p-4">
          <p>Want a head start? Add the suggested categories for an Indian household — you can change them afterwards.</p>
          <Button type="button" variant="outline" disabled={addingSuggested} onClick={() => void addSuggested()}>
            Add suggested categories
          </Button>
        </div>
      )}

      {panel?.type === "add" && (
        <Dialog
          title={panel.parent ? `Add a sub-category to ${panel.parent.name}` : `Add an ${KIND_TITLE[panel.kind].toLowerCase()} category`}
          onClose={close}
        >
          <CategoryForm mode={{ type: "create", kind: panel.kind, parent: panel.parent }} onDone={close} onCancel={close} />
        </Dialog>
      )}
      {current && panel?.type === "manage" && (
        <Dialog title={categoryPath(current.id, index)} onClose={close}>
          <CategoryActions
            category={current}
            categories={categories}
            categoriesStart={categoriesStart}
            payees={payees}
            onAddChild={() => {
              setExpanded((e) => new Set(e).add(current.id));
              setPanel({ type: "add", kind: current.kind, parent: current });
            }}
            onEdit={() => setPanel({ type: "edit", id: current.id })}
            onMove={() => setPanel({ type: "move", id: current.id })}
            onClose={close}
          />
        </Dialog>
      )}
      {current && panel?.type === "edit" && (
        <Dialog title={`Edit ${current.name}`} onClose={close}>
          <CategoryForm mode={{ type: "edit", category: current }} onDone={close} onCancel={close} />
        </Dialog>
      )}
      {current && panel?.type === "move" && (
        <Dialog title={`Move ${current.name}`} description="Its sub-categories move with it." onClose={close}>
          <MoveCategoryForm
            category={current}
            categories={categories}
            categoriesStart={categoriesStart}
            onDone={close}
            onCancel={close}
          />
        </Dialog>
      )}
    </div>
  );
}

function Tree({
  nodes,
  expanded,
  onToggle,
  onManage,
}: {
  nodes: CategoryNode[];
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onManage: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => (
        <li key={node.id} className="border-t border-border first:border-t-0">
          <CategoryRow
            node={node}
            label={node.name}
            expanded={node.children.length > 0 ? expanded.has(node.id) : undefined}
            onToggle={() => onToggle(node.id)}
            onManage={() => onManage(node.id)}
          />
          {node.children.length > 0 && expanded.has(node.id) && (
            <div className="pl-6">
              <Tree nodes={node.children} expanded={expanded} onToggle={onToggle} onManage={onManage} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function CategoryRow({
  node,
  label,
  expanded,
  onToggle,
  onManage,
}: {
  node: CategoryNode;
  label: string;
  expanded?: boolean;
  onToggle?: () => void;
  onManage: () => void;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2 py-1" data-category-name={node.name}>
      {expanded === undefined ? (
        <span className="w-7 shrink-0" aria-hidden="true" />
      ) : (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} sub-categories of ${node.name}`}
          onClick={onToggle}
        >
          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        </Button>
      )}
      <AppIcon icon={node.icon} colour={node.colour} size="sm" />
      <span className={`min-w-0 flex-1 break-words ${node.effectiveHidden ? "text-muted-foreground" : ""}`}>
        {label}
        {node.hidden && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"> Hidden</span>}
        {!node.hidden && node.effectiveHidden && (
          <span className="ml-2 text-xs text-muted-foreground"> Hidden with its parent</span>
        )}
      </span>
      <Button type="button" size="sm" variant="ghost" onClick={onManage} aria-label={`Manage ${label}`}>
        Manage
      </Button>
    </div>
  );
}
