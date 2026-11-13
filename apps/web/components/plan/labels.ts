import { PERSON_ACTION_TEXT, type PlanItem, type PlanRow } from "@ft/core";

/** Names the plan shows, looked up once per page (deleted rows keep a plain-words fallback). */
export interface PlanNames {
  account: (id: string | null) => string;
  payee: (id: string | null) => string;
  category: (id: string | null) => string | null;
}

/** What an item pays, in words: "Sunrise Apartments · Rent", "Rewards Card bill", "Repaid to Meera Iyer". */
export function paysText(item: PlanItem, names: PlanNames): string {
  switch (item.target) {
    case "card":
      return `${names.account(item.cardAccountId)} bill`;
    case "person":
      return `${PERSON_ACTION_TEXT[item.personAction ?? "repaid_to"]} ${names.payee(item.payeeId)}`;
    case "payee": {
      const category = names.category(item.categoryId);
      return category ? `${names.payee(item.payeeId)} · ${category}` : names.payee(item.payeeId);
    }
  }
}

/** The status in words (FR-002); never shown by colour alone. */
export function statusText(row: Pick<PlanRow, "status" | "daysLate" | "paidMinor">): string {
  switch (row.status) {
    case "paid":
      return "Paid";
    case "part_paid":
      return "Part paid";
    case "due":
      return "Due";
    case "due_today":
      return "Due today";
    case "skipped":
      return "Skipped";
    case "overdue": {
      const late = row.daysLate === 1 ? "1 day late" : `${row.daysLate ?? 0} days late`;
      return row.paidMinor > 0n ? `Overdue, part paid · ${late}` : `Overdue · ${late}`;
    }
  }
}

/** A colour that repeats the words (never the only signal, constitution XIII). */
export function statusTone(status: PlanRow["status"]): string {
  switch (status) {
    case "paid":
      return "border-green-700/40 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100";
    case "overdue":
      return "border-red-700/40 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100";
    case "part_paid":
    case "due_today":
      return "border-amber-700/40 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100";
    default:
      return "border-border bg-muted text-foreground";
  }
}
