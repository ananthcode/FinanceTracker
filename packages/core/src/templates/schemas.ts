/**
 * Quick-add templates on the wire (specs/008-quick-add-templates/contracts/sync-protocol.md) and as
 * screens and the core read them. A template is a transaction's details without its date; the shape rules
 * are R4's. Rules that need the database (ownership, kinds, the tie fitting the planned payment) are the
 * server's too.
 */
import { z } from "zod";
import { OrderKey } from "../accounts/schemas";
import { charLength, trimmedName } from "../schemas/text";
import { kindProblem, PositiveMinorString, TransactionLines } from "../transactions/schemas";
import { MONEY_FLOWS, PERSON_ACTIONS, type MoneyFlow, type PersonAction, type TransactionLine, type TransactionKind } from "../transactions/types";

/** Kinds a template can have: interest is proposed or entered from a person's page (R4), never a template. */
export const TEMPLATE_KINDS = ["expense", "income", "refund", "transfer", "person"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];
/** Adjustments need a reason each time, so they are not templates. */
export const TEMPLATE_PERSON_ACTIONS = PERSON_ACTIONS.filter((a) => a !== "adjustment") as Exclude<PersonAction, "adjustment">[];

export const TEMPLATE_LIMIT = 100;

const notes = z
  .string()
  .refine((s) => charLength(s) <= 1000, "At most 1,000 characters")
  .nullable();

const fields = {
  name: trimmedName(40),
  accountId: z.uuid(),
  toAccountId: z.uuid().nullable(),
  amountMinor: PositiveMinorString.nullable(),
  payeeId: z.uuid().nullable(),
  personAction: z.enum(TEMPLATE_PERSON_ACTIONS as [string, ...string[]]).nullable(),
  flow: z.enum(MONEY_FLOWS).nullable(),
  categoryId: z.uuid().nullable(),
  lines: TransactionLines,
  tagIds: z.array(z.uuid()).max(20),
  notes,
  planItemId: z.uuid().nullable(),
  sortKey: OrderKey,
  hidden: z.boolean(),
};

type Shape = {
  kind: TemplateKind;
  accountId: string;
  toAccountId: string | null;
  amountMinor: string | null;
  payeeId: string | null;
  personAction: string | null;
  flow: MoneyFlow | null;
  categoryId: string | null;
  lines: { amountMinor: string; categoryId: string | null; personId: string | null; personAction: string | null }[];
  notes: string | null;
};

/** R4's shape rules for the kind, plus: a split needs an amount (FR-002). Returns a message, or null. */
export function templateProblem(t: Shape): string | null {
  if (t.lines.length > 0 && t.amountMinor === null) return "A split template needs its amount, for the lines to add up to";
  return kindProblem({
    ...t,
    kind: t.kind as TransactionKind,
    personAction: t.personAction as PersonAction | null,
    amountMinor: t.amountMinor ?? "0",
  });
}

export const TemplateCreateFields = z
  .object({
    ...fields,
    kind: z.enum(TEMPLATE_KINDS),
    toAccountId: fields.toAccountId.default(null),
    amountMinor: fields.amountMinor.default(null),
    payeeId: fields.payeeId.default(null),
    personAction: fields.personAction.default(null),
    flow: fields.flow.default(null),
    categoryId: fields.categoryId.default(null),
    lines: fields.lines.default([]),
    tagIds: fields.tagIds.default([]),
    notes: fields.notes.default(null),
    planItemId: fields.planItemId.default(null),
    hidden: fields.hidden.default(false),
  })
  .strict()
  .superRefine((t, ctx) => {
    const problem = templateProblem(t);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["kind"] });
  });
export type TemplateCreateFields = z.infer<typeof TemplateCreateFields>;

/** Any changed fields; `kind` never changes; the amount and the split lines travel together (R4-01). */
export const TemplateUpdateFields = z
  .object(fields)
  .partial()
  .strict()
  .refine((f) => Object.keys(f).length > 0, "Nothing to change")
  .refine((f) => ("amountMinor" in f) === ("lines" in f), { message: "The amount and the split lines change together", path: ["lines"] })
  .refine(
    (f) => !f.lines || f.lines.length === 0 || (f.amountMinor != null && f.lines.reduce((s, l) => s + BigInt(l.amountMinor), 0n) === BigInt(f.amountMinor)),
    { message: "The split lines must add up to the amount", path: ["lines"] },
  );
export type TemplateUpdateFields = z.infer<typeof TemplateUpdateFields>;

/** A template as screens and the core read it. */
export interface TemplateView {
  id: string;
  name: string;
  kind: TemplateKind;
  flow: MoneyFlow;
  accountId: string;
  toAccountId: string | null;
  /** null = "amount each time". */
  amountMinor: bigint | null;
  payeeId: string | null;
  personAction: Exclude<PersonAction, "adjustment"> | null;
  categoryId: string | null;
  lines: TransactionLine[];
  tagIds: string[];
  notes: string | null;
  planItemId: string | null;
  sortKey: string;
  hidden: boolean;
  state: "active" | "deleted";
}
