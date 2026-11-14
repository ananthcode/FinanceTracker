/**
 * The spreadsheet tables (R10-03, FR-003, FR-004): one per record type, names instead of ids (categories
 * as their full path), dates as dates, amounts in paise for the writers to show in rupees. A date range keeps
 * only the transactions in it (and their split lines and attachments); lists are always complete.
 */
import { ACCOUNT_TYPE_LABEL } from "../accounts/labels";
import type { AccountType } from "../accounts/types";
import { PERSON_ACTION_TEXT, TRANSACTION_KIND_TEXT, TRANSACTION_STATUS_TEXT } from "../transactions/labels";
import type { PersonAction, TransactionKind, TransactionStatus } from "../transactions/types";
import type { BackupFile, WireRow } from "./backup";
import type { Cell, ExportTable } from "./table";

export interface DateRange {
  from: string;
  to: string;
}

const s = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const big = (v: unknown): bigint | null => (v === null || v === undefined ? null : BigInt(String(v)));
const moneyCell = (v: unknown): Cell => {
  const m = big(v);
  return m === null ? null : { money: m };
};
const dateCell = (v: unknown): Cell => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? { date: v.slice(0, 10) } : null);

const FREQUENCY_TEXT: Record<string, string> = {
  monthly: "Monthly",
  every_n_months: "Every few months",
  yearly: "Yearly",
  one_off: "One-off",
};
const INTEREST_TEXT: Record<string, string> = { none: "None", automatic: "Automatic", manual: "Manual" };

/** The transactions in the range, oldest first, numbered from 1. */
function inRange(rows: WireRow[], range: DateRange | null): WireRow[] {
  return rows
    .filter((t) => !range || (String(t.date) >= range.from && String(t.date) <= range.to))
    .sort((a, b) => `${a.date}|${a.timeOfDay ?? ""}|${a.createdAt ?? ""}|${a.id}`.localeCompare(`${b.date}|${b.timeOfDay ?? ""}|${b.createdAt ?? ""}|${b.id}`));
}

export function exportTables(
  backup: BackupFile,
  options: { range?: DateRange | null; filePaths?: ReadonlyMap<string, string> } = {},
): ExportTable[] {
  const r = backup.records;
  const range = options.range ?? null;
  const name = (rows: WireRow[]) => new Map(rows.map((x) => [x.id, String(x.name)]));
  const accounts = name(r.account);
  const groups = name(r.account_group);
  const payees = name(r.payee);
  const tags = name(r.tag);
  const items = name(r.plan_item);
  const categoryById = new Map(r.category.map((c) => [c.id, c]));
  const path = (id: unknown): string | null => {
    const parts: string[] = [];
    let c = id ? categoryById.get(String(id)) : undefined;
    for (let depth = 0; c && depth < 20; depth++) {
      parts.unshift(String(c.name));
      c = c.parentId ? categoryById.get(String(c.parentId)) : undefined;
    }
    return parts.length > 0 ? parts.join(" › ") : null;
  };
  const of = (map: Map<string, string>, id: unknown) => (id ? (map.get(String(id)) ?? null) : null);
  const tagText = (v: unknown) => (Array.isArray(v) && v.length > 0 ? (v as string[]).map((t) => `#${tags.get(t) ?? "tag"}`).join(" ") : null);

  const transactions = inRange(r.transaction, range);
  const number = new Map(transactions.map((t, i) => [t.id, i + 1]));
  const attachmentsOf = new Map<string, number>();
  for (const a of r.attachment) attachmentsOf.set(String(a.transactionId), (attachmentsOf.get(String(a.transactionId)) ?? 0) + 1);

  const tables: ExportTable[] = [
    {
      name: "Accounts",
      file: "accounts",
      columns: ["Name", "Type", "Group", "Opening balance", "Opening date", "Credit limit", "In net worth", "Archived", "Notes"],
      rows: r.account.map((a) => [
        String(a.name),
        ACCOUNT_TYPE_LABEL[a.type as AccountType] ?? String(a.type),
        of(groups, a.groupId),
        moneyCell(a.openingBalanceMinor),
        dateCell(a.openingBalanceDate),
        moneyCell(a.creditLimitMinor),
        a.includeInNetWorth === true,
        a.state === "archived",
        s(a.notes),
      ]),
    },
    {
      name: "People & payees",
      file: "people-and-payees",
      columns: ["Name", "Kind", "Default category", "Opening balance", "Opening date", "In net worth", "Interest", "Hidden", "Notes"],
      rows: r.payee.map((p) => [
        String(p.name),
        p.kind === "person" ? "Person" : "Business",
        path(p.defaultCategoryId),
        p.kind === "person" ? moneyCell(p.openingBalanceMinor) : null,
        dateCell(p.openingBalanceDate),
        p.kind === "person" ? p.includeInNetWorth === true : null,
        p.kind === "person" ? (INTEREST_TEXT[String(p.interestMode)] ?? null) : null,
        p.hidden === true,
        s(p.notes),
      ]),
    },
    {
      name: "Categories",
      file: "categories",
      columns: ["Path", "Kind", "Hidden"],
      rows: r.category.map((c) => [path(c.id), c.kind === "income" ? "Income" : "Expense", c.hidden === true]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    },
    { name: "Tags", file: "tags", columns: ["Name"], rows: r.tag.map((t) => [String(t.name)]) },
    {
      name: "Transactions",
      file: "transactions",
      columns: [
        "No.", "Date", "Time", "Type", "Account", "To account", "Payee / person", "What happened", "Category", "Tags", "Amount",
        "In / out", "Status", "Confirmed", "Notes", "Reference", "Pays", "Under warranty until", "Warranty note", "Attachments",
      ],
      rows: transactions.map((t) => {
        const lines = Array.isArray(t.lines) ? t.lines : [];
        return [
          number.get(t.id)!,
          dateCell(t.date),
          s(t.timeOfDay ? String(t.timeOfDay).slice(0, 5) : null),
          TRANSACTION_KIND_TEXT[t.kind as TransactionKind] ?? String(t.kind),
          of(accounts, t.accountId),
          of(accounts, t.toAccountId),
          of(payees, t.payeeId),
          t.personAction ? (PERSON_ACTION_TEXT[t.personAction as PersonAction] ?? String(t.personAction)) : null,
          lines.length > 0 ? "Split" : path(t.categoryId),
          tagText(t.tagIds),
          moneyCell(t.amountMinor),
          t.flow === "in" ? "In" : "Out",
          TRANSACTION_STATUS_TEXT[t.status as TransactionStatus] ?? String(t.status),
          t.confirmed !== false,
          s(t.notes),
          s(t.reference),
          t.planItemId && t.planMonth ? `${of(items, t.planItemId) ?? "A planned payment"} (${String(t.planMonth).slice(0, 7)})` : null,
          dateCell(t.warrantyUntil),
          s(t.warrantyNote),
          attachmentsOf.get(t.id) ?? 0,
        ];
      }),
    },
    {
      name: "Split lines",
      file: "split-lines",
      columns: ["Transaction no.", "Category", "Person", "What happened", "Amount", "Tags", "Notes"],
      rows: transactions.flatMap((t) =>
        (Array.isArray(t.lines) ? (t.lines as Record<string, unknown>[]) : []).map((l): Cell[] => [
          number.get(t.id)!,
          path(l.categoryId),
          of(payees, l.personId),
          l.personAction ? (PERSON_ACTION_TEXT[l.personAction as PersonAction] ?? String(l.personAction)) : null,
          moneyCell(l.amountMinor),
          tagText(l.tagIds),
          s(l.notes),
        ]),
      ),
    },
    {
      name: "Interest rates",
      file: "interest-rates",
      columns: ["Person", "From month", "Rate % per month"],
      rows: r.person_rate.map((x) => [of(payees, x.payeeId), dateCell(x.effectiveMonth), Number(x.rateE4) / 10_000]),
    },
    {
      name: "Payment plan",
      file: "payment-plan",
      columns: ["Item", "Pays", "Frequency", "Every N months", "Start month", "End month", "Amount varies", "Terms", "Notes"],
      rows: r.plan_item.map((i) => [
        String(i.name),
        i.target === "card" ? `Card bill: ${of(accounts, i.cardAccountId) ?? ""}` : (of(payees, i.payeeId) ?? null),
        FREQUENCY_TEXT[String(i.frequency)] ?? String(i.frequency),
        Number(i.intervalMonths),
        dateCell(i.startMonth),
        dateCell(i.endMonth),
        i.amountVaries === true,
        (Array.isArray(i.terms) ? (i.terms as Record<string, unknown>[]) : [])
          .map((t) => {
            const amount = big(t.amountMinor);
            return `from ${String(t.fromMonth).slice(0, 7)}: ${amount === null ? "varies" : `Rs. ${(Number(amount) / 100).toFixed(2)}`}, day ${t.dueDay}, ${of(accounts, t.accountId) ?? ""}`;
          })
          .join("; "),
        s(i.notes),
      ]),
    },
    {
      name: "Plan months",
      file: "plan-months",
      columns: ["Item", "Month", "Amount", "Skipped"],
      rows: r.plan_occurrence.map((o) => [of(items, o.itemId), dateCell(o.month), moneyCell(o.amountMinor), o.skipped === true]),
    },
    {
      name: "Templates",
      file: "templates",
      columns: ["Name", "Type", "Account", "To account", "Payee / person", "Category", "Amount", "Pays", "Hidden", "Notes"],
      rows: r.template.map((t) => [
        String(t.name),
        TRANSACTION_KIND_TEXT[t.kind as TransactionKind] ?? String(t.kind),
        of(accounts, t.accountId),
        of(accounts, t.toAccountId),
        of(payees, t.payeeId),
        Array.isArray(t.lines) && t.lines.length > 0 ? "Split" : path(t.categoryId),
        moneyCell(t.amountMinor),
        of(items, t.planItemId),
        t.hidden === true,
        s(t.notes),
      ]),
    },
    {
      name: "Attachments",
      file: "attachments",
      columns: ["Transaction no.", "Date", "Name", "Type", "Size (bytes)", "File"],
      rows: r.attachment
        .filter((a) => number.has(String(a.transactionId)))
        .map((a) => {
          const t = r.transaction.find((x) => x.id === a.transactionId);
          return [
            number.get(String(a.transactionId))!,
            dateCell(t?.date),
            String(a.name),
            a.contentType === "application/pdf" ? "PDF" : "Photo",
            Number(a.sizeBytes),
            options.filePaths?.get(a.id) ?? null,
          ];
        }),
    },
  ];
  return tables;
}

/** The transactions a range keeps (for the attachment files to include). */
export function transactionIdsInRange(backup: BackupFile, range: DateRange | null): Set<string> {
  return new Set(inRange(backup.records.transaction, range).map((t) => t.id));
}

const safeName = (text: string) =>
  text
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

/** "attachments/007 2026-11-14 Refrigerator receipt (demo).pdf" — unique by its number. */
export function attachmentFilePath(n: number, date: string | null, name: string): string {
  return `attachments/${String(n).padStart(3, "0")} ${date ? `${date} ` : ""}${safeName(name) || "file"}`;
}

/** The download's name (FR-006). */
export function exportFileName(kind: "backup" | "xlsx" | "csv", today: string, options: { range?: DateRange | null; zipped?: boolean } = {}): string {
  if (kind === "backup") return `Finance Tracker backup ${today}.${options.zipped ? "zip" : "json"}`;
  const what = options.range ? `${options.range.from} to ${options.range.to}` : `everything ${today}`;
  return `Finance Tracker ${what}.${kind === "xlsx" && !options.zipped ? "xlsx" : "zip"}`;
}
