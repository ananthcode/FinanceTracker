import { z } from "zod";

/** Length in characters (code points), matching Postgres `char_length`. */
export const charLength = (s: string) => [...s].length;

/** A name trimmed of leading and trailing spaces, 1–`max` characters (R2 FR-002, R3 FR-002/9/12). */
export const trimmedName = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => charLength(s) >= 1 && charLength(s) <= max, `Must be 1–${max} characters`);

/** Optional notes, at most 500 characters. */
export const Notes = z
  .string()
  .refine((s) => charLength(s) <= 500, "At most 500 characters")
  .nullable();
