import { PushRequest } from "@ft/core";
import { pushChanges, SyncUserInactiveError } from "@ft/db";
import { errors } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { hitRateLimit } from "@/lib/rate-limit";

/** Push requests per user per minute (each push holds at most 100 changes). */
const PUSHES_PER_MINUTE = 60;

/**
 * POST /api/sync/push — the single write path for synced records, used by web writes and Android
 * sync (contracts/http-api.md, research R2-01/R2-05). A body failing the change schemas is refused
 * whole (400); rules only the database can check reject single changes inside a 200 response.
 * Nothing from the payload is logged (FR-028).
 */
export const POST = route({ auth: "user", name: "/api/sync/push", body: PushRequest }, async ({ body, user, supabase, client }) => {
  // A browser session writes as "web", a bearer token as "android" — the history records it (FR-027).
  if (body.device !== client) throw errors.validation("The device does not match how this request signed in.");
  if (!(await hitRateLimit("sync-push", user!.id, 60, PUSHES_PER_MINUTE))) throw errors.tryLater();
  try {
    return Response.json({ results: await pushChanges(supabase!, body) });
  } catch (err) {
    if (err instanceof SyncUserInactiveError) throw errors.inactive();
    throw err;
  }
});
