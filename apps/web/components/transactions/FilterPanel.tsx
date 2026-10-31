"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  compareNames,
  formatAmountInput,
  parseAmountInput,
  TRANSACTION_KIND_TEXT,
  TRANSACTION_KINDS,
  TRANSACTION_STATUS_TEXT,
  TRANSACTION_STATUSES,
  type AccountView,
  type PayeeView,
  type TagView,
} from "@ft/core";
import type { TransactionFilters } from "@ft/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

/**
 * Search and filters for the transactions list (R4 FR-017, US6 1–2). Everything is kept in the URL,
 * so a filtered list can be bookmarked and "Load more" pages through the same filters. A category
 * includes its sub-categories; "Uncategorised" finds what has none.
 */
export function FilterPanel({
  filters,
  accounts,
  categoryPaths,
  payees,
  tags,
  currency,
}: {
  filters: TransactionFilters;
  accounts: AccountView[];
  /** [id, full path] in tree order. */
  categoryPaths: [string, string][];
  payees: PayeeView[];
  tags: TagView[];
  currency: string;
}) {
  const ids = useId();
  const router = useRouter();
  const [text, setText] = useState(filters.text ?? "");
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const [account, setAccount] = useState(filters.accountId ?? "");
  const [category, setCategory] = useState(filters.categoryId ?? "");
  const [payee, setPayee] = useState(filters.payeeId ?? "");
  const [tag, setTag] = useState(filters.tagId ?? "");
  const [kinds, setKinds] = useState<string[]>(filters.kinds ?? []);
  const [statuses, setStatuses] = useState<string[]>(filters.statuses ?? []);
  const [min, setMin] = useState(filters.minMinor ? formatAmountInput(BigInt(filters.minMinor), currency) : "");
  const [max, setMax] = useState(filters.maxMinor ? formatAmountInput(BigInt(filters.maxMinor), currency) : "");
  const [error, setError] = useState<string | null>(null);
  const advanced = Object.keys(filters).some((k) => k !== "text");

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    const amount = (value: string, key: string) => {
      if (value.trim() === "") return true;
      const parsed = parseAmountInput(value, { currency });
      if (!parsed.ok || parsed.minor < 0n) return false;
      params.set(key, parsed.minor.toString());
      return true;
    };
    if (text.trim()) params.set("q", text.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (account) params.set("account", account);
    if (category) params.set("category", category);
    if (payee) params.set("payee", payee);
    if (tag) params.set("tag", tag);
    if (kinds.length) params.set("type", kinds.join(","));
    if (statuses.length) params.set("status", statuses.join(","));
    if (!amount(min, "min") || !amount(max, "max")) return setError("Enter amounts like 1,000.00.");
    setError(null);
    const query = params.toString();
    router.push(query ? `/transactions?${query}` : "/transactions");
  }

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <form onSubmit={apply} role="search" aria-label="Find transactions" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${ids}-text`}>Search</Label>
          <Input
            id={`${ids}-text`}
            type="search"
            value={text}
            placeholder="Payee, category, notes or reference no."
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <Button type="submit">Find</Button>
        <Link href="/transactions" className="px-2 py-2 text-sm text-brand-strong underline dark:text-brand">
          Clear
        </Link>
      </div>
      <details open={advanced} className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Filters</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-from`}>From date</Label>
            <Input id={`${ids}-from`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-to`}>To date</Label>
            <Input id={`${ids}-to`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-account`}>Account</Label>
            <select id={`${ids}-account`} className={selectClass} value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">Any account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-category`}>Category</Label>
            <select id={`${ids}-category`} className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Any category</option>
              <option value="uncategorised">Uncategorised</option>
              {categoryPaths.map(([id, path]) => (
                <option key={id} value={id}>
                  {path}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-payee`}>Payee or person</Label>
            <select id={`${ids}-payee`} className={selectClass} value={payee} onChange={(e) => setPayee(e.target.value)}>
              <option value="">Anyone</option>
              {[...payees].sort((a, b) => compareNames(a.name, b.name)).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-tag`}>Tag</Label>
            <select id={`${ids}-tag`} className={selectClass} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Any tag</option>
              {[...tags].sort((a, b) => compareNames(a.name, b.name)).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-min`}>Amount from</Label>
            <Input id={`${ids}-min`} inputMode="decimal" value={min} placeholder="0.00" onChange={(e) => setMin(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-max`}>Amount up to</Label>
            <Input id={`${ids}-max`} inputMode="decimal" value={max} placeholder="0.00" onChange={(e) => setMax(e.target.value)} />
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Type</legend>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {TRANSACTION_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={kinds.includes(k)} onChange={() => toggle(kinds, setKinds, k)} />
                  {TRANSACTION_KIND_TEXT[k]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Status</legend>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {TRANSACTION_STATUSES.map((s) => (
                <label key={s} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggle(statuses, setStatuses, s)} />
                  {TRANSACTION_STATUS_TEXT[s]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <Button type="submit" variant="outline" size="sm" className="mt-3">
          Apply filters
        </Button>
      </details>
    </form>
  );
}
