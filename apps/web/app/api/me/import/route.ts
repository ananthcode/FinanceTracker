import { z } from "zod";
import { Change, MAX_CHANGES_PER_IMPORT_CHUNK } from "@ft/core";
import { importAbort, importBegin, importChunk, importFinish, ImportRefused, myOpenImport, resetMyData } from "@ft/db";
import { ApiError, errors } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { removeAllFilesOf } from "@/lib/attachments-server";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * Importing a backup (R10, specs/010-data-export/contracts/export-import.md; research R10-05): begin (only
 * into empty data, or reset first after RESET), chunks applied through the change appliers, finish, or abort
 * (the R5 reset). The client builds and checks the changes with core; the database checks every one again.
 * Nothing about the records is logged.
 */
/** Whole-household work: up to 60 s on Vercel (the Hobby default is 10 s). */
export const maxDuration = 60;

const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin"), reset: z.literal("RESET").optional() }).strict(),
  z.object({ action: z.literal("chunk"), importId: z.uuid(), changes: z.array(Change).min(1).max(MAX_CHANGES_PER_IMPORT_CHUNK) }).strict(),
  z
    .object({
      action: z.literal("finish"),
      importId: z.uuid(),
      interest: z
        .object({
          proposals: z.array(z.object({ transactionId: z.uuid(), interestMonth: Month, userEdited: z.boolean() }).strict()).max(5000),
          declined: z.array(z.object({ payeeId: z.uuid(), month: Month }).strict()).max(5000),
        })
        .strict(),
      categoriesStart: z.enum(["suggested", "empty"]).nullable(),
    })
    .strict(),
  z.object({ action: z.literal("abort"), importId: z.uuid() }).strict(),
]);

function refused(err: unknown): never {
  if (err instanceof ImportRefused) {
    if (err.code === "NOT_EMPTY") throw new ApiError(409, "NOT_EMPTY", "A backup can only be imported into empty data. Reset first.");
    if (err.code === "IMPORT_NOT_OPEN") throw new ApiError(409, "IMPORT_NOT_OPEN", "This import is no longer open. Start again.");
    if (err.code === "USER_INACTIVE") throw errors.inactive();
    if (err.code === "IMPORT_REJECTED") {
      throw new ApiError(409, "IMPORT_REJECTED", `Record ${err.index! + 1} of this part was refused (${err.changeCode}).`);
    }
    if (err.code === "VALIDATION_FAILED") throw errors.validation("The backup's details are not valid.");
  }
  throw err;
}

export const GET = route({ auth: "user", name: "/api/me/import" }, async ({ supabase }) => Response.json({ open: await myOpenImport(supabase!) }));

export const POST = route({ auth: "user", name: "/api/me/import", body: Body }, async ({ body, user, supabase, client }) => {
  if (!(await hitRateLimit("data-import", user!.id, 60, 200))) throw errors.tryLater();
  const db = supabase!;
  try {
    switch (body.action) {
      case "begin": {
        if (body.reset === "RESET") {
          await resetMyData(db, client);
          await removeAllFilesOf(user!.id).catch(() => 0);
        }
        return Response.json({ importId: await importBegin(db, client) });
      }
      case "chunk":
        return Response.json({ applied: await importChunk(db, body.importId, body.changes) });
      case "finish":
        return Response.json({ counts: await importFinish(db, body.importId, body.interest, body.categoriesStart) });
      case "abort": {
        const removed = await importAbort(db, body.importId);
        await removeAllFilesOf(user!.id).catch(() => 0);
        return Response.json({ removed });
      }
    }
  } catch (err) {
    refused(err);
  }
});
