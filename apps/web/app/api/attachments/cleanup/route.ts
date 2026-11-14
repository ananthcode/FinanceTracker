import { route } from "@/lib/api/handler";
import { removeMyOrphanFiles } from "@/lib/attachments-server";

/**
 * POST /api/attachments/cleanup — removes the caller's files that no live record needs: deleted
 * attachments (also those deleted with their transaction) and uploads whose record never arrived
 * (research R9-03). Clients call it after deleting, and now and then after a sync.
 */
export const POST = route({ auth: "user", name: "/api/attachments/cleanup" }, async ({ supabase }) =>
  Response.json({ removed: await removeMyOrphanFiles(supabase!) }),
);
