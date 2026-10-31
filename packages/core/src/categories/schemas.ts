/**
 * Category fields on the wire (R3 contracts/sync-protocol.md). `kind` is create-only (FR-001);
 * unknown and server-controlled fields are rejected (`strict`).
 */
import { z } from "zod";
import { ACCOUNT_COLOUR_KEYS } from "../accounts/appearance";
import { APPEARANCE_ICON_KEYS } from "../appearance/icons";
import { trimmedName } from "../schemas/text";
import { CATEGORY_KINDS } from "./types";

export const CategoryName = trimmedName(40);
export const CategoryKindSchema = z.enum(CATEGORY_KINDS);

const updatable = {
  name: CategoryName,
  parentId: z.uuid().nullable(),
  colour: z.enum(ACCOUNT_COLOUR_KEYS as [string, ...string[]]),
  icon: z.enum(APPEARANCE_ICON_KEYS),
  hidden: z.boolean(),
};

export const CategoryCreateFields = z
  .object({
    ...updatable,
    kind: CategoryKindSchema,
    parentId: updatable.parentId.default(null),
    hidden: updatable.hidden.default(false),
  })
  .strict();

export const CategoryUpdateFields = z
  .object(updatable)
  .partial()
  .strict()
  .refine((f) => Object.keys(f).length > 0, "Nothing to change");

export type CategoryCreateFields = z.infer<typeof CategoryCreateFields>;
export type CategoryUpdateFields = z.infer<typeof CategoryUpdateFields>;
