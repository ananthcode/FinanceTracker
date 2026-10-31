// Tags (R3): free-form labels.
import { z } from "zod";
import { trimmedName } from "../schemas/text";

export const TagName = trimmedName(30);

/** Tags carry only a name; create and update take the same shape (FR-009). */
export const TagFields = z.object({ name: TagName }).strict();
export type TagFields = z.infer<typeof TagFields>;

/** A tag as the screens read it (deleted rows excluded). */
export interface TagView {
  id: string;
  name: string;
}
