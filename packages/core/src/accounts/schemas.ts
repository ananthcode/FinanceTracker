/**
 * Account and group field schemas on the wire (contracts/sync-protocol.md, data-model.md).
 * Money travels as decimal strings of integer minor units, never JSON numbers (Principle II).
 * Create schemas require every field the row needs; update schemas take any non-empty subset.
 * Unknown and server-controlled fields are rejected (`strict`).
 */
import { z } from "zod";
import { ORDER_KEY_PATTERN } from "../ordering/keys";
import { MAX_AMOUNT_MINOR } from "../money/parse";
import { ACCOUNT_COLOUR_KEYS, ACCOUNT_ICON_KEYS } from "./appearance";
import { ACCOUNT_TYPES } from "./types";

/** Length in characters (code points), matching Postgres `char_length`. */
const chars = (s: string) => [...s].length;

const trimmedName = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => chars(s) >= 1 && chars(s) <= max, `Must be 1–${max} characters`);

const MINOR_PATTERN = /^-?\d{1,12}$/;

/**
 * Integer minor units as a decimal string, e.g. "5234050" or "-50000". Zod 4 runs refinements even
 * after the regex fails, so each refinement re-checks the pattern before calling BigInt (which
 * would otherwise throw on input like "52340.50").
 */
export const MinorString = z
  .string()
  .regex(MINOR_PATTERN, "Must be whole minor units")
  .refine((s) => {
    if (!MINOR_PATTERN.test(s)) return true; // already reported by the regex
    const v = BigInt(s);
    return v >= -MAX_AMOUNT_MINOR && v <= MAX_AMOUNT_MINOR;
  }, "Out of range");

const PositiveMinorString = MinorString.refine((s) => !MINOR_PATTERN.test(s) || BigInt(s) > 0n, "Must be greater than zero");

/** Calendar date `yyyy-MM-dd` that exists. */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Not a real date");

/** Keys grow about one character per 6 inserts into the same gap; 1000 leaves ample room. */
export const OrderKey = z.string().min(1).max(1000).regex(ORDER_KEY_PATTERN);

export const AccountName = trimmedName(40);
export const GroupName = trimmedName(30);
export const AccountTypeSchema = z.enum(ACCOUNT_TYPES);

const accountFields = {
  name: AccountName,
  type: AccountTypeSchema,
  openingBalanceMinor: MinorString,
  openingBalanceDate: IsoDate,
  colour: z.enum(ACCOUNT_COLOUR_KEYS as [string, ...string[]]),
  icon: z.enum(ACCOUNT_ICON_KEYS),
  sortKey: OrderKey,
  groupId: z.uuid().nullable(),
  includeInNetWorth: z.boolean(),
  notes: z
    .string()
    .refine((s) => chars(s) <= 500, "At most 500 characters")
    .nullable(),
  creditLimitMinor: PositiveMinorString.nullable(),
};

export const AccountCreateFields = z
  .object({
    ...accountFields,
    groupId: accountFields.groupId.default(null),
    includeInNetWorth: accountFields.includeInNetWorth.default(true),
    notes: accountFields.notes.default(null),
    creditLimitMinor: accountFields.creditLimitMinor.default(null),
  })
  .strict()
  .refine((f) => f.creditLimitMinor === null || f.type === "credit_card", {
    message: "Only credit cards have a credit limit",
    path: ["creditLimitMinor"],
  });

export const AccountUpdateFields = z
  .object(accountFields)
  .partial()
  .strict()
  .refine((f) => Object.keys(f).length > 0, "Nothing to change");

export const GroupCreateFields = z.object({ name: GroupName, sortKey: OrderKey }).strict();
export const GroupUpdateFields = z
  .object({ name: GroupName, sortKey: OrderKey })
  .partial()
  .strict()
  .refine((f) => Object.keys(f).length > 0, "Nothing to change");

export type AccountCreateFields = z.infer<typeof AccountCreateFields>;
export type AccountUpdateFields = z.infer<typeof AccountUpdateFields>;
export type GroupCreateFields = z.infer<typeof GroupCreateFields>;
export type GroupUpdateFields = z.infer<typeof GroupUpdateFields>;
