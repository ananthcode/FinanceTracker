import { z } from "zod";
import { BACKUP_ENTITIES } from "@ft/core";
import { logExport } from "@ft/db";
import { errors } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { hitRateLimit } from "@/lib/rate-limit";

/** POST /api/me/export-log — records that an export happened (format, counts, range), never its contents (R10-07). */
const Body = z
  .object({
    format: z.enum(["backup", "xlsx", "csv"]),
    counts: z.partialRecord(z.enum(BACKUP_ENTITIES), z.number().int().min(0).max(10_000_000)),
    range: z.object({ from: z.iso.date(), to: z.iso.date() }).strict().nullable(),
    files: z.boolean(),
    locked: z.boolean(),
  })
  .strict();

export const POST = route({ auth: "user", name: "/api/me/export-log", body: Body }, async ({ body, user, supabase, client }) => {
  if (!(await hitRateLimit("data-export", user!.id, 60, 30))) throw errors.tryLater();
  await logExport(supabase!, {
    format: body.format,
    counts: body.counts as Record<string, number>,
    from: body.range?.from ?? null,
    to: body.range?.to ?? null,
    files: body.files,
    locked: body.locked,
    device: client,
  });
  return new Response(null, { status: 204 });
});
