import { route } from "@/lib/api/handler";

/** GET /api/auth/ping — "Stay signed in" from the idle warning; the proxy refreshes activity. */
export const GET = route({ auth: "user", name: "/api/auth/ping" }, async () => new Response(null, { status: 204 }));
