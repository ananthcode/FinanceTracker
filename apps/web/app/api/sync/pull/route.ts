import { pullChanges, SyncUserInactiveError } from "@ft/db";
import { errors } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { hitRateLimit } from "@/lib/rate-limit";

const PULLS_PER_MINUTE = 60;
const CURSOR = /^\d{1,18}$/;

/**
 * GET /api/sync/pull?cursor=&limit= — the caller's synced rows changed since the cursor, oldest
 * first, at most `limit` (1–500, default 500) per page (contracts/sync-protocol.md §Pull). Used by
 * the Android app; row-level security limits it to the caller's own rows.
 */
export const GET = route({ auth: "user", name: "/api/sync/pull" }, async ({ request, user, supabase }) => {
  const params = new URL(request.url).searchParams;
  const cursor = params.get("cursor") ?? "0";
  const limitText = params.get("limit");
  if (!CURSOR.test(cursor)) throw errors.validation("The cursor is not valid.");
  const limit = limitText === null ? 500 : Number(limitText);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw errors.validation("The limit must be 1–500.");
  if (!(await hitRateLimit("sync-pull", user!.id, 60, PULLS_PER_MINUTE))) throw errors.tryLater();
  try {
    return Response.json(await pullChanges(supabase!, cursor, limit));
  } catch (err) {
    if (err instanceof SyncUserInactiveError) throw errors.inactive();
    throw err;
  }
});
