/**
 * Transaction and person-rate fields on the wire (R4 contracts/sync-protocol.md). Money is a
 * decimal string of integer paise. Shape rules live here; rules that need the database (account
 * active and owned, category kind, person is a person, opening dates) are the server's.
 */
import { z } from "zod";
import { IsoDate, MinorString } from "../accounts/schemas";
import { charLength } from "../schemas/text";
import {
  flowOf,
  MONEY_FLOWS,
  PERSON_ACTIONS,
  TRANSACTION_KINDS,
  TRANSACTION_STATUSES,
  type MoneyFlow,
  type TransactionKind,
} from "./types";

const MINOR = /^-?\d{1,12}$/;
/** A positive amount: 1 … 999999999999 paise. */
export const PositiveMinorString = MinorString.refine((s) => !MINOR.test(s) || BigInt(s) > 0n, "Must be greater than zero");

const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const text = (max: number) =>
  z
    .string()
    .refine((s) => charLength(s) <= max, `At most ${max} characters`)
    .nullable();
const TagIds = z.array(z.uuid()).max(20);

export const TransactionLineFields = z
  .object({
    id: z.uuid(),
    amountMinor: PositiveMinorString,
    categoryId: z.uuid().nullable().default(null),
    personId: z.uuid().nullable().default(null),
    personAction: z.enum(["paid_on_behalf", "collected_on_behalf"]).nullable().default(null),
    notes: text(500).default(null),
    tagIds: TagIds.default([]),
  })
  .strict()
  .refine((l) => (l.personId === null) === (l.personAction === null), {
    message: "A person share needs both the person and the action",
    path: ["personAction"],
  })
  .refine((l) => !(l.personId !== null && l.categoryId !== null), {
    message: "A line is either a category or a person share",
    path: ["categoryId"],
  });

const Lines = z.array(TransactionLineFields).refine((ls) => ls.length === 0 || (ls.length >= 2 && ls.length <= 50), "A split has 2–50 lines");

const fields = {
  date: IsoDate,
  timeOfDay: TimeOfDay.nullable(),
  accountId: z.uuid().nullable(),
  toAccountId: z.uuid().nullable(),
  amountMinor: PositiveMinorString,
  payeeId: z.uuid().nullable(),
  personAction: z.enum(PERSON_ACTIONS).nullable(),
  flow: z.enum(MONEY_FLOWS).nullable(),
  categoryId: z.uuid().nullable(),
  lines: Lines,
  tagIds: TagIds,
  notes: text(1000),
  reference: text(40),
  status: z.enum(TRANSACTION_STATUSES),
  confirmed: z.boolean(),
};

type Create = {
  kind: TransactionKind;
  accountId: string | null;
  toAccountId: string | null;
  amountMinor: string;
  payeeId: string | null;
  personAction: (typeof PERSON_ACTIONS)[number] | null;
  flow: MoneyFlow | null;
  categoryId: string | null;
  lines: { amountMinor: string; categoryId: string | null; personId: string | null; personAction: string | null }[];
  notes: string | null;
};

/** The shape rules of each kind (FR-001, FR-010 – FR-012). Returns a message, or null when valid. */
export function kindProblem(t: Create): string | null {
  const implied = flowOf(t.kind, t.personAction);
  const flow = implied ?? t.flow;
  if (implied && t.flow && t.flow !== implied) return "The direction does not match the type";
  if (!flow) return "Choose whether money went out or came in";
  const linesTotal = t.lines.reduce((s, l) => s + BigInt(l.amountMinor), 0n);
  if (t.lines.length > 0 && linesTotal !== BigInt(t.amountMinor)) return "The split lines must add up to the amount";
  switch (t.kind) {
    case "expense":
    case "income":
    case "refund": {
      if (!t.accountId || t.toAccountId || t.personAction) return "Choose one account";
      if (t.lines.length > 0 && t.categoryId) return "A split transaction has its categories on the lines";
      const shareAction = flow === "out" ? "paid_on_behalf" : "collected_on_behalf";
      if (t.lines.some((l) => l.personAction && l.personAction !== shareAction)) return "A person share must match the direction";
      return null;
    }
    case "transfer":
      if (!t.accountId || !t.toAccountId) return "Choose both accounts";
      if (t.accountId === t.toAccountId) return "Choose two different accounts";
      if (t.payeeId || t.personAction || t.categoryId || t.lines.length > 0) return "A transfer has no payee, category or split";
      return null;
    case "person":
      if (!t.payeeId || !t.personAction) return "Choose the person and what happened";
      if (t.categoryId || t.lines.length > 0 || t.toAccountId) return "A person movement has no category or split";
      if (t.personAction === "adjustment") {
        if (t.accountId) return "An adjustment moves no money between accounts";
        if (!t.notes || t.notes.trim() === "") return "Give a reason for the adjustment";
        return null;
      }
      return t.accountId ? null : "Choose the account the money moved through";
    case "interest":
      if (!t.payeeId || t.accountId || t.toAccountId || t.categoryId || t.lines.length > 0 || t.personAction) {
        return "Interest belongs to a person only";
      }
      return null;
  }
}

export const TransactionCreateFields = z
  .object({
    ...fields,
    kind: z.enum(TRANSACTION_KINDS),
    timeOfDay: fields.timeOfDay.default(null),
    accountId: fields.accountId.default(null),
    toAccountId: fields.toAccountId.default(null),
    payeeId: fields.payeeId.default(null),
    personAction: fields.personAction.default(null),
    flow: fields.flow.default(null),
    categoryId: fields.categoryId.default(null),
    lines: fields.lines.default([]),
    tagIds: fields.tagIds.default([]),
    notes: fields.notes.default(null),
    reference: fields.reference.default(null),
    status: fields.status.default("uncleared"),
    confirmed: fields.confirmed.default(true),
  })
  .strict()
  .superRefine((t, ctx) => {
    const problem = kindProblem(t);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["kind"] });
  });

/** Any changed fields; `kind` never changes; amount and split lines travel together (R4-01). */
export const TransactionUpdateFields = z
  .object(fields)
  .partial()
  .strict()
  .refine((f) => Object.keys(f).length > 0, "Nothing to change")
  .refine((f) => ("amountMinor" in f) === ("lines" in f), {
    message: "The amount and the split lines change together",
    path: ["lines"],
  })
  .refine((f) => !f.lines || f.lines.length === 0 || f.lines.reduce((s, l) => s + BigInt(l.amountMinor), 0n) === BigInt(f.amountMinor!), {
    message: "The split lines must add up to the amount",
    path: ["lines"],
  });

const EffectiveMonth = IsoDate.refine((s) => s.endsWith("-01"), "Rates start on the 1st of a month");
const RateE4 = z.number().int().min(0).max(100_000);

export const PersonRateCreateFields = z.object({ payeeId: z.uuid(), effectiveMonth: EffectiveMonth, rateE4: RateE4 }).strict();
export const PersonRateUpdateFields = z
  .object({ effectiveMonth: EffectiveMonth, rateE4: RateE4 })
  .partial()
  .strict()
  .refine((f) => Object.keys(f).length > 0, "Nothing to change");

/** Relocate moves every transaction from the change's category or payee to the target (FR-019). */
export const RelocateFields = z.object({ targetId: z.uuid() }).strict();

export type TransactionCreateFields = z.infer<typeof TransactionCreateFields>;
export type TransactionUpdateFields = z.infer<typeof TransactionUpdateFields>;
