"use client";

import { X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { compareNames, type TagView } from "@ft/core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_TAGS = 20;
const MAX_OPTIONS = 50;

type Option = { key: string; tag: TagView; isNew: boolean; label: string };

/**
 * Choose any number of tags (R4 FR-004): chosen tags show as removable chips; typing finds tags or
 * offers to create a new one, which is saved together with the transaction (`created`).
 */
export function TagPicker({
  label,
  tags,
  value,
  created,
  onChange,
}: {
  label: string;
  tags: TagView[];
  value: string[];
  /** Tags added here and not yet saved. */
  created: TagView[];
  onChange: (ids: string[], created: TagView[]) => void;
}) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const all = useMemo(() => [...tags, ...created], [tags, created]);
  const byId = useMemo(() => new Map(all.map((t) => [t.id, t])), [all]);
  const full = value.length >= MAX_TAGS;

  const options: Option[] = useMemo(() => {
    const q = query.trim();
    const lower = q.toLocaleLowerCase("en");
    const list: Option[] = all
      .filter((t) => !value.includes(t.id) && (lower === "" || t.name.toLocaleLowerCase("en").includes(lower)))
      .sort((a, b) => compareNames(a.name, b.name))
      .slice(0, MAX_OPTIONS)
      .map((t) => ({ key: t.id, tag: t, isNew: false, label: t.name }));
    if (q !== "" && [...q].length <= 30 && !all.some((t) => t.name.toLocaleLowerCase("en") === lower)) {
      list.push({ key: "new", tag: { id: "", name: q }, isNew: true, label: `Create tag “${q}”` });
    }
    return list;
  }, [query, all, value]);

  function choose(option: Option) {
    if (option.isNew) {
      const tag = { id: crypto.randomUUID(), name: option.tag.name };
      onChange([...value, tag.id], [...created, tag]);
    } else {
      onChange([...value, option.tag.id], created);
    }
    setQuery("");
    setActive(0);
  }

  function remove(id: string) {
    onChange(
      value.filter((v) => v !== id),
      created.filter((t) => t.id !== id),
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = options[active];
      if (open && option) choose(option);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && value.length > 0) {
      remove(value[value.length - 1]!);
    }
  }

  const listId = `${ids}-list`;
  const optionId = (i: number) => `${ids}-option-${i}`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${ids}-input`}>{label}</Label>
      {value.length > 0 && (
        <ul aria-label="Chosen tags" className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <li key={id} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-sm">
              {byId.get(id)?.name ?? "Tag"}
              <button
                type="button"
                aria-label={`Remove tag ${byId.get(id)?.name ?? ""}`}
                onClick={() => remove(id)}
                className="rounded-full p-0.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={`${ids}-input`}
        role="combobox"
        aria-expanded={open && !full}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? optionId(active) : undefined}
        autoComplete="off"
        disabled={full}
        placeholder={full ? `Up to ${MAX_TAGS} tags` : "Type to find or create a tag"}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && !full && options.length > 0 && (
        <ul id={listId} role="listbox" aria-label={label} className="max-h-48 w-full overflow-auto rounded-md border border-border bg-background py-1">
          {options.map((option, i) => (
            <li
              key={option.key}
              id={optionId(i)}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${i === active ? "bg-muted" : ""} ${option.isNew ? "font-medium" : ""}`}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
