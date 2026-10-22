import { route } from "@/lib/api/handler";
import { adminOverview } from "@/lib/admin";

/** GET /api/admin/overview — invitations and users, FR-014 fields only (US4). */
export const GET = route({ auth: "owner", name: "/api/admin/overview" }, async () => Response.json(await adminOverview()));
