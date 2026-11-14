import { z } from "zod";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES, ATTACHMENTS_PER_TRANSACTION, allowanceLeft, formatBytes } from "@ft/core";
import { ATTACHMENTS_BUCKET, attachmentPath, attachmentUsage } from "@ft/db";
import { ApiError, errors } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/attachments — a one-time link to upload one file into the caller's folder
 * (specs/009-attachments-warranty/contracts/attachments.md; research R9-02). The browser uploads to
 * it directly (no file passes through this server), then pushes the attachment record. Checked here
 * so the user hears early: the transaction is theirs and live, it has room, and the allowance has room.
 * The storage policies and the record's applier check again.
 */
const Body = z
  .object({
    transactionId: z.uuid(),
    contentType: z.enum(ATTACHMENT_TYPES),
    sizeBytes: z.number().int().min(1).max(ATTACHMENT_MAX_BYTES),
  })
  .strict();

export const POST = route({ auth: "user", name: "/api/attachments", body: Body }, async ({ body, user, supabase }) => {
  if (!(await hitRateLimit("attachment-upload", user!.id, 60, 60))) throw errors.tryLater();
  const db = supabase!;

  const { data: tx, error } = await db.from("transactions").select("id").eq("id", body.transactionId).eq("state", "active").maybeSingle();
  if (error) throw new Error("TRANSACTION_READ_FAILED");
  if (!tx) throw errors.notFound();

  const { count, error: countError } = await db
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("transaction_id", body.transactionId)
    .eq("state", "active");
  if (countError) throw new Error("ATTACHMENTS_READ_FAILED");
  if ((count ?? 0) >= ATTACHMENTS_PER_TRANSACTION) {
    throw new ApiError(409, "LIMIT_REACHED", "A transaction can have 10 attachments. Remove one first.");
  }

  const usage = await attachmentUsage(db);
  const free = allowanceLeft(usage.bytes, usage.allowance);
  if (BigInt(body.sizeBytes) > free) {
    throw new ApiError(409, "QUOTA_EXCEEDED", `Not enough attachment space: ${formatBytes(free)} of ${formatBytes(usage.allowance)} is free.`);
  }

  const id = crypto.randomUUID();
  const path = attachmentPath(user!.id, id);
  const { data, error: signError } = await db.storage.from(ATTACHMENTS_BUCKET).createSignedUploadUrl(path);
  if (signError || !data) throw new ApiError(409, "QUOTA_EXCEEDED", "This file can't be stored now. Check your attachment space.");
  return Response.json({ id, uploadUrl: data.signedUrl });
});
