/**
 * Plan items and item months on the wire (specs/007-payment-plan/contracts/sync-protocol.md) and as
 * screens and the core read them. Money is a decimal string of paise on the wire, `bigint` in views.
 * Rules that need the database (ownership, account and payee kinds, terms in the past, months with
 * payments) are the server's.
 */
import { z } from "zod";
import { IsoDate, MinorString } from "../accounts/schemas";
import { Notes, trimmedName } from "../schemas/text";

export const PLAN_FREQUENCIES = ["monthly", "every_n_months", "yearly", "one_off"] as const;
export type PlanFrequency = (typeof PLAN_FREQUENCIES)[number];

export const PLAN_TARGETS = ["payee", "card", "person"] as const;
export type PlanTarget = (typeof PLAN_TARGETS)[number];

/** Person movements a plan item can pay: money out to the person (R7-03). */
export const PLAN_PERSON_ACTIONS = ["lent", "repaid_to", "paid_on_behalf"] as const;
export type PlanPersonAction = (typeof PLAN_PERSON_ACTIONS)[number];

/** `yyyy-MM-01` */
export type Month = string;

const MINOR = /^\d{1,12}$/;
export const PlanMonthString = IsoDate.refine((s) => s.endsWith("-01"), "Months start on the 1st");
const PositiveMinor = MinorString.refine((s) => !MINOR.test(s) || BigInt(s) > 0n, "Must be greater than zero");
const NonNegativeMinor = MinorString.refine((s) => !s.startsWith("-"), "Must not be negative");

/** The months between repeats: 1 monthly, N every N months, 12 yearly, 0 one-off (R7-04). */
export function intervalFor(frequency: PlanFrequency, everyN?: number): number {
  switch (frequency) {
    case "monthly":
      return 1;
    case "every_n_months":
      return everyN ?? 2;
    case "yearly":
      return 12;
    case "one_off":
      return 0;
  }
}

export const PlanTermFields = z
  .object({
    fromMonth: PlanMonthString,
    amountMinor: PositiveMinor.nullable(),
    dueDay: z.number().int().min(1).max(31),
    accountId: z.uuid(),
  })
  .strict();
export type PlanTermFields = z.infer<typeof PlanTermFields>;

const Terms = z
  .array(PlanTermFields)
  .min(1)
  .max(120)
  .refine((ts) => ts.every((t, i) => i === 0 || ts[i - 1]!.fromMonth < t.fromMonth), "Terms must be in month order");

const itemFields = {
  name: trimmedName(60),
  payeeId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  cardAccountId: z.uuid().nullable(),
  personAction: z.enum(PLAN_PERSON_ACTIONS).nullable(),
  frequency: z.enum(PLAN_FREQUENCIES),
  intervalMonths: z.number().int().min(0).max(12),
  startMonth: PlanMonthString,
  endMonth: PlanMonthString.nullable(),
  amountVaries: z.boolean(),
  terms: Terms,
  notes: Notes,
};

function intervalOk(frequency: PlanFrequency, interval: number): boolean {
  if (frequency === "every_n_months") return interval >= 2 && interval <= 12;
  return interval === intervalFor(frequency);
}

export const PlanItemCreateFields = z
  .object({
    ...itemFields,
    target: z.enum(PLAN_TARGETS),
    payeeId: itemFields.payeeId.default(null),
    categoryId: itemFields.categoryId.default(null),
    cardAccountId: itemFields.cardAccountId.default(null),
    personAction: itemFields.personAction.default(null),
    endMonth: itemFields.endMonth.default(null),
    amountVaries: itemFields.amountVaries.default(false),
    notes: itemFields.notes.default(null),
  })
  .strict()
  .superRefine((f, ctx) => {
    const problem = targetProblem(f);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["target"] });
    if (!intervalOk(f.frequency, f.intervalMonths)) {
      ctx.addIssue({ code: "custom", message: "The interval does not match how often it repeats", path: ["intervalMonths"] });
    }
    if (f.endMonth !== null && f.endMonth < f.startMonth) {
      ctx.addIssue({ code: "custom", message: "The end month is before the start month", path: ["endMonth"] });
    }
    if (f.frequency === "one_off" && f.endMonth !== f.startMonth) {
      ctx.addIssue({ code: "custom", message: "A one-off ends in its start month", path: ["endMonth"] });
    }
    if (f.terms[0]!.fromMonth !== f.startMonth) {
      ctx.addIssue({ code: "custom", message: "The first term starts in the start month", path: ["terms"] });
    }
    if (f.target !== "card" && !f.amountVaries && f.terms.some((t) => t.amountMinor === null)) {
      ctx.addIssue({ code: "custom", message: "Enter the amount", path: ["terms"] });
    }
  });
export type PlanItemCreateFields = z.infer<typeof PlanItemCreateFields>;

/** Any changed fields; `target` never changes; frequency and interval travel together. */
export const PlanItemUpdateFields = z
  .object(itemFields)
  .partial()
  .strict()
  .refine((f) => Object.keys(f).length > 0, "Nothing to change")
  .refine((f) => ("frequency" in f) === ("intervalMonths" in f), {
    message: "How often it repeats and the interval change together",
    path: ["intervalMonths"],
  })
  .refine((f) => f.frequency === undefined || f.intervalMonths === undefined || intervalOk(f.frequency, f.intervalMonths), {
    message: "The interval does not match how often it repeats",
    path: ["intervalMonths"],
  });
export type PlanItemUpdateFields = z.infer<typeof PlanItemUpdateFields>;

/** The fields a target needs (FR-005). Returns a message, or null when valid. */
export function targetProblem(f: {
  target: PlanTarget;
  payeeId: string | null;
  categoryId: string | null;
  cardAccountId: string | null;
  personAction: string | null;
}): string | null {
  switch (f.target) {
    case "payee":
      if (!f.payeeId) return "Choose who it is paid to";
      if (f.cardAccountId || f.personAction) return "A payment to a payee has no card or person action";
      return null;
    case "card":
      if (!f.cardAccountId) return "Choose the credit card";
      if (f.payeeId || f.categoryId || f.personAction) return "A card bill has no payee or category";
      return null;
    case "person":
      if (!f.payeeId || !f.personAction) return "Choose the person and what the payment is";
      if (f.cardAccountId || f.categoryId) return "A payment to a person has no card or category";
      return null;
  }
}

/**
 * Only the fields the user changed are sent (no defaults): two devices creating the same item-month
 * merge per field (R7-02), so an unsent field must not carry a version.
 */
export const PlanOccurrenceCreateFields = z
  .object({
    itemId: z.uuid(),
    month: PlanMonthString,
    amountMinor: NonNegativeMinor.nullable().optional(),
    skipped: z.boolean().optional(),
  })
  .strict()
  .refine((f) => f.amountMinor !== undefined || f.skipped !== undefined, "Set an amount or skip the month");
export const PlanOccurrenceUpdateFields = z
  .object({ amountMinor: NonNegativeMinor.nullable(), skipped: z.boolean() })
  .partial()
  .strict()
  .refine((f) => Object.keys(f).length > 0, "Nothing to change");
export type PlanOccurrenceCreateFields = z.infer<typeof PlanOccurrenceCreateFields>;
export type PlanOccurrenceUpdateFields = z.infer<typeof PlanOccurrenceUpdateFields>;

// ---------------------------------------------------------------- views

export interface PlanTerm {
  fromMonth: Month;
  amountMinor: bigint | null;
  dueDay: number;
  accountId: string;
}

export interface PlanItem {
  id: string;
  name: string;
  target: PlanTarget;
  payeeId: string | null;
  categoryId: string | null;
  cardAccountId: string | null;
  personAction: PlanPersonAction | null;
  frequency: PlanFrequency;
  intervalMonths: number;
  startMonth: Month;
  endMonth: Month | null;
  amountVaries: boolean;
  terms: PlanTerm[];
  notes: string | null;
  state: "active" | "deleted";
}

export interface PlanOccurrence {
  id: string;
  itemId: string;
  month: Month;
  amountMinor: bigint | null;
  skipped: boolean;
}

/** A transaction linked to an item-month, as the plan reads it (narrow columns, R7-13). */
export interface LinkedTransaction {
  id: string;
  planItemId: string;
  planMonth: Month;
  amountMinor: bigint;
  date: string;
  state: "active" | "deleted";
  confirmed: boolean;
  status: "uncleared" | "cleared" | "follow_up" | "void";
}

/** Terms on the wire → view. */
export function termsFromWire(terms: PlanTermFields[]): PlanTerm[] {
  return terms.map((t) => ({ ...t, amountMinor: t.amountMinor === null ? null : BigInt(t.amountMinor) }));
}

/** Terms view → wire. */
export function termsToWire(terms: PlanTerm[]): PlanTermFields[] {
  return terms.map((t) => ({
    fromMonth: t.fromMonth,
    amountMinor: t.amountMinor === null ? null : t.amountMinor.toString(),
    dueDay: t.dueDay,
    accountId: t.accountId,
  }));
}
