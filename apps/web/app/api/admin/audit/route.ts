import { route } from "@/lib/api/handler";
import { adminAuditFeed } from "@/lib/admin";

/** GET /api/admin/audit?cursor= — invitation and access-change events for everyone (FR-039). */
export const GET = route({ auth: "owner", name: "/api/admin/audit" }, async ({ request }) => {
  const raw = new URL(request.url).searchParams.get("cursor");
  const cursor = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  return Response.json(await adminAuditFeed(cursor));
});
