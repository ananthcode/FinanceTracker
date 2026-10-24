import { route } from "@/lib/api/handler";
import { loadMe } from "@/lib/me";

/** GET /api/me — the caller's profile, preferences and environment (US3). */
export const GET = route({ auth: "user", name: "/api/me" }, async ({ supabase, user }) =>
  Response.json(await loadMe(supabase!, user!.id)),
);
