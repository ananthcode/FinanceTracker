/**
 * Payee fields on the wire (R3 contracts/sync-protocol.md). A person needs an opening-balance date;
 * a business carries no opening balance and never counts in net worth (FR-016, FR-020). Money is a
 * decimal string of integer paise, positive when the person owes the user.
 */
import { z } from "zod";
import { IsoDate, MinorString } from "../accounts/schemas";
import { Notes, trimmedName } from "../schemas/text";
import { INTEREST_MODES } from "../transactions/types";
import { PAYEE_KINDS, STATEMENT_SIGNS } from "./types";

export const PayeeName = trimmedName(60);
export const PayeeKindSchema = z.enum(PAYEE_KINDS);

const fields = {
  name: PayeeName,
  kind: PayeeKindSchema,
  defaultCategoryId: z.uuid().nullable(),
  notes: Notes,
  hidden: z.boolean(),
  openingBalanceMinor: MinorString,
  openingBalanceDate: IsoDate.nullable(),
  includeInNetWorth: z.boolean(),
  /** People only (R4 FR-013): none, automatic or manual interest. */
  interestMode: z.enum(INTEREST_MODES),
  /** People only (R6 FR-010): which direction their statement shows as positive. */
  statementSign: z.enum(STATEMENT_SIGNS),
};

/** A business may only send the neutral opening values. */
function businessIsNeutral(
  f: Partial<{ kind: string; openingBalanceMinor: string; openingBalanceDate: string | null; includeInNetWorth: boolean; interestMode: string }>,
) {
  if (f.kind !== "business") return true;
  return (
    (f.openingBalanceMinor === undefined || /^-?0+$/.test(f.openingBalanceMinor)) &&
    (f.openingBalanceDate === undefined || f.openingBalanceDate === null) &&
    (f.includeInNetWorth === undefined || f.includeInNetWorth === false) &&
    (f.interestMode === undefined || f.interestMode === "none")
  );
}

export const PayeeCreateFields = z
  .object({
    ...fields,
    defaultCategoryId: fields.defaultCategoryId.default(null),
    notes: fields.notes.default(null),
    hidden: fields.hidden.default(false),
    openingBalanceMinor: fields.openingBalanceMinor.default("0"),
    openingBalanceDate: fields.openingBalanceDate.default(null),
    includeInNetWorth: fields.includeInNetWorth.default(false),
    interestMode: fields.interestMode.default("none"),
    statementSign: fields.statementSign.default("they_owe_positive"),
  })
  .strict()
  .refine((f) => f.kind !== "person" || f.openingBalanceDate !== null, {
    message: "A person needs an opening-balance date",
    path: ["openingBalanceDate"],
  })
  .refine(businessIsNeutral, { message: "A business has no opening balance", path: ["openingBalanceMinor"] });

/** Cross-row rules (person → business only at ₹0.00, date not in the future) are the server's. */
export const PayeeUpdateFields = z
  .object(fields)
  .partial()
  .strict()
  .refine((f) => Object.keys(f).length > 0, "Nothing to change")
  .refine(businessIsNeutral, { message: "A business has no opening balance", path: ["openingBalanceMinor"] });

export type PayeeCreateFields = z.infer<typeof PayeeCreateFields>;
export type PayeeUpdateFields = z.infer<typeof PayeeUpdateFields>;
