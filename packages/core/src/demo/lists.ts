/**
 * Deterministic demo categories, tags and payees (constitution X, research R3-15). Synthetic only —
 * invented shops and people (constitution V). R5's "Load demo data / reset my data" inserts this
 * set with demoAccounts(); R3 uses it in tests and the e2e seed helper. Every call returns exactly
 * the same data.
 *
 * Covers: the suggested default tree; custom categories three levels deep; a hidden category;
 * tags; businesses with default categories; people who owe the user, whom the user owes, who are
 * settled, one switched into net worth, and a hidden person with a balance.
 */
import { DEFAULT_CATEGORIES } from "../categories/defaults";
import type { CategoryView } from "../categories/types";
import type { PayeeView } from "../payees/types";
import type { TagView } from "../tags";

const OPENING_DATE = "2025-04-01"; // start of the Apr–Mar financial year

const id = (block: string, n: number) => `00000000-0000-4000-8000-0000000${block}${String(n).padStart(3, "0")}`;
const categoryId = (n: number) => id("c0", n);
const tagId = (n: number) => id("e0", n);
const payeeId = (n: number) => id("f0", n);

export interface DemoLists {
  categories: CategoryView[];
  tags: TagView[];
  payees: PayeeView[];
}

export function demoLists(): DemoLists {
  const categories: CategoryView[] = [];
  let n = 0;
  const add = (c: Omit<CategoryView, "id" | "hidden"> & { hidden?: boolean }): string => {
    const newId = categoryId(++n);
    categories.push({ id: newId, hidden: false, ...c });
    return newId;
  };

  // The suggested defaults, in their listed order.
  const byPath = new Map<string, string>();
  for (const parent of DEFAULT_CATEGORIES) {
    const parentId = add({ name: parent.name, kind: parent.kind, parentId: null, colour: parent.colour, icon: parent.icon });
    byPath.set(parent.name, parentId);
    for (const child of parent.children) {
      byPath.set(`${parent.name} › ${child.name}`, add({ name: child.name, kind: parent.kind, parentId, colour: parent.colour, icon: child.icon }));
    }
  }
  const at = (path: string) => byPath.get(path)!;

  // Custom: Education › Kids › Swimming classes / Music lessons (three levels deep).
  const kids = add({ name: "Kids", kind: "expense", parentId: at("Education"), colour: "indigo", icon: "baby" });
  add({ name: "Swimming classes", kind: "expense", parentId: kids, colour: "indigo", icon: "star" });
  add({ name: "Music lessons", kind: "expense", parentId: kids, colour: "indigo", icon: "star" });
  // Hidden: a category the household no longer uses.
  categories.find((c) => c.id === at("Education › Tuition & classes"))!.hidden = true;

  const tags: TagView[] = ["Diwali 2025", "Goa trip", "Reimbursable", "School term 1", "Home repairs"].map((name, i) => ({
    id: tagId(i + 1),
    name,
  }));

  const business = (i: number, name: string, category: string, notes: string | null = null): PayeeView => ({
    id: payeeId(i),
    name,
    kind: "business",
    defaultCategoryId: at(category),
    notes,
    hidden: false,
    openingBalanceMinor: 0n,
    openingBalanceDate: null,
    includeInNetWorth: false,
  });
  const person = (i: number, name: string, opening: bigint, extra: Partial<PayeeView> = {}): PayeeView => ({
    id: payeeId(i),
    name,
    kind: "person",
    defaultCategoryId: null,
    notes: null,
    hidden: false,
    openingBalanceMinor: opening,
    openingBalanceDate: OPENING_DATE,
    includeInNetWorth: false,
    ...extra,
  });

  const payees: PayeeView[] = [
    business(1, "Fresh Mart", "Food & groceries › Groceries", "Weekly vegetables and staples"),
    business(2, "City Power Board", "Utilities & bills › Electricity"),
    business(3, "Sunrise Dairy", "Food & groceries › Milk & dairy"),
    business(4, "Quick Fuel Station", "Transport › Fuel"),
    business(5, "Greenfield School", "Education › School & college fees"),
    business(6, "Acme Payroll", "Salary › Salary"),
    business(7, "Corner Cafe", "Food & groceries › Eating out"),
    business(8, "Metro Rail", "Transport › Public transport"),
    person(11, "Ravi Kumar", 1_500_000n, { includeInNetWorth: true, notes: "Lent for his bike, Apr 2025" }),
    person(12, "Meera Iyer", -450_000n),
    person(13, "Anil Rao", 0n),
    person(14, "Priya Nair", 2_500_050n),
    person(15, "Old Neighbour", 75_000n, { hidden: true }),
  ];

  return { categories, tags, payees };
}
