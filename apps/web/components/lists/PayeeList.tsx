"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { categoryPath, compareNames, indexCategories, personBalance, type CategoryView, type PayeeView } from "@ft/core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonBalance } from "./PersonBalance";

type KindFilter = "all" | "business" | "person";
const FILTER_LABEL: Record<KindFilter, string> = { all: "All", business: "Businesses", person: "People" };

/**
 * Settings › Payees list (R3 FR-013): search as you type, filter by kind, show hidden payees on
 * request. Each row shows the default category's full path; people show their balance in words.
 */
export function PayeeList({ payees, categories }: { payees: PayeeView[]; categories: CategoryView[] }) {
  const ids = useId();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [showHidden, setShowHidden] = useState(false);
  const index = useMemo(() => indexCategories(categories), [categories]);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("en");
    return payees
      .filter((p) => (kind === "all" || p.kind === kind) && (showHidden || !p.hidden))
      .filter((p) => q === "" || p.name.toLocaleLowerCase("en").includes(q))
      .sort((a, b) => compareNames(a.name, b.name));
  }, [payees, query, kind, showHidden]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-search`}>Search payees</Label>
        <Input
          id={`${ids}-search`}
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Type part of a name"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="sr-only">Show</legend>
          {(["all", "business", "person"] as const).map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-sm">
              <input type="radio" name={`${ids}-kind`} checked={kind === k} onChange={() => setKind(k)} />
              {FILTER_LABEL[k]}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          Show hidden
        </label>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {shown.length === 1 ? "1 payee" : `${shown.length} payees`}
      </p>
      {shown.length === 0 ? (
        <p className="text-muted-foreground">{payees.length === 0 ? "No payees yet." : "No payee matches."}</p>
      ) : (
        <ul aria-label="Payees" className="flex flex-col divide-y divide-border">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2" data-payee-name={p.name}>
              <Link href={`/settings/payees/${p.id}`} className="font-medium text-brand-strong hover:underline dark:text-brand">
                {p.name}
              </Link>
              <span className="text-sm text-muted-foreground">{p.kind === "person" ? "Person" : "Business"}</span>
              {p.hidden && <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Hidden</span>}
              {p.defaultCategoryId && (
                <span className="text-sm text-muted-foreground">
                  {" "}
                  Default: {categoryPath(p.defaultCategoryId, index) || "—"}
                </span>
              )}
              {p.kind === "person" && <PersonBalance balance={personBalance(p)} className="ml-auto text-sm" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
