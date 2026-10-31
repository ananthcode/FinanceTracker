import { z } from "zod";
import { categoryPath, indexCategories, TRANSACTION_KINDS, TRANSACTION_STATUSES, type AccountView, type CategoryView, type PayeeView, type TagView } from "@ft/core";
import type { TransactionCursor, TransactionFilters } from "@ft/db";

/** Filters as the list's URL and the "Load more" action carry them (R4 FR-017). */
export const FiltersSchema = z
  .object({
    text: z.string().max(100).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    accountId: z.uuid().optional(),
    categoryId: z.union([z.uuid(), z.literal("uncategorised")]).optional(),
    payeeId: z.uuid().optional(),
    tagId: z.uuid().optional(),
    kinds: z.array(z.enum(TRANSACTION_KINDS)).max(6).optional(),
    statuses: z.array(z.enum(TRANSACTION_STATUSES)).max(4).optional(),
    minMinor: z.string().regex(/^\d{1,12}$/).optional(),
    maxMinor: z.string().regex(/^\d{1,12}$/).optional(),
    upcoming: z.boolean().optional(),
  })
  .strict();

export const CursorSchema = z
  .object({ date: z.iso.date(), time: z.string().max(15), createdAt: z.string().max(40), id: z.uuid() })
  .strict();

/** The filters in a list URL; anything malformed is ignored. */
export function filtersFromParams(params: Record<string, string | string[] | undefined>): TransactionFilters {
  const one = (key: string) => {
    const v = params[key];
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const many = (key: string) => one(key)?.split(",");
  const candidate = {
    text: one("q"),
    from: one("from"),
    to: one("to"),
    accountId: one("account"),
    categoryId: one("category"),
    payeeId: one("payee"),
    tagId: one("tag"),
    kinds: many("type"),
    statuses: many("status"),
    minMinor: one("min"),
    maxMinor: one("max"),
  };
  const filters: Record<string, unknown> = {};
  // Keep each valid filter on its own, so one bad value does not drop the rest.
  for (const [key, value] of Object.entries(candidate)) {
    if (value === undefined) continue;
    const shape = FiltersSchema.shape[key as keyof typeof FiltersSchema.shape];
    if (shape.safeParse(value).success) filters[key] = value;
  }
  return filters as TransactionFilters;
}

export function parseCursor(value: unknown): TransactionCursor | null {
  const parsed = CursorSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Names the list shows for ids (account, payee, category path, tag). Plain objects: they cross to client components. */
export interface TransactionNames {
  accounts: Record<string, string>;
  payees: Record<string, string>;
  categories: Record<string, string>;
  tags: Record<string, string>;
}

export function namesOf(accounts: AccountView[], payees: PayeeView[], categories: CategoryView[], tags: TagView[]): TransactionNames {
  const index = indexCategories(categories);
  return {
    accounts: Object.fromEntries(accounts.map((a) => [a.id, a.name])),
    payees: Object.fromEntries(payees.map((p) => [p.id, p.name])),
    categories: Object.fromEntries(categories.map((c) => [c.id, categoryPath(c.id, index)])),
    tags: Object.fromEntries(tags.map((t) => [t.id, t.name])),
  };
}

/** A same-site path to go back to after saving; anything else falls back. */
export function safeReturn(value: string | string[] | undefined, fallback: string): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
}
