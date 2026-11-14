/**
 * Attachment records on the wire (R9, specs/009-attachments-warranty/contracts/attachments.md). The file
 * itself is stored first, at `<user>/<id>` in the private bucket; the record names it. Sizes are decimal
 * strings, as money is.
 */
import { z } from "zod";
import { charLength } from "../schemas/text";

/** What is stored: photos are converted to JPEG on the device (R9-04); PDFs are kept as they are. */
export const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

/** 10 MB per stored file. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Each user's allowance: 200 MB (clarify Q1). */
export const ATTACHMENT_ALLOWANCE = 200n * 1024n * 1024n;
export const ATTACHMENTS_PER_TRANSACTION = 10;
export const ATTACHMENT_NAME_MAX = 120;

export const AttachmentName = z
  .string()
  .refine((s) => s === s.trim() && charLength(s) >= 1 && charLength(s) <= ATTACHMENT_NAME_MAX, "1 to 120 characters");

const SizeBytes = z
  .string()
  .regex(/^[1-9]\d{0,8}$/, "A whole number of bytes")
  .refine((s) => Number(s) <= ATTACHMENT_MAX_BYTES, "At most 10 MB");

export const AttachmentCreateFields = z
  .object({
    transactionId: z.uuid(),
    name: AttachmentName,
    contentType: z.enum(ATTACHMENT_TYPES),
    sizeBytes: SizeBytes,
  })
  .strict();
export type AttachmentCreateFields = z.infer<typeof AttachmentCreateFields>;

/** The file never changes; only its name can be edited. */
export const AttachmentUpdateFields = z.object({ name: AttachmentName }).strict();
export type AttachmentUpdateFields = z.infer<typeof AttachmentUpdateFields>;

export interface AttachmentView {
  id: string;
  transactionId: string;
  name: string;
  contentType: AttachmentType;
  sizeBytes: number;
  /** When it was added (ISO timestamp). */
  createdAt: string;
}

export interface AttachmentUsage {
  files: number;
  bytes: bigint;
  allowance: bigint;
}
