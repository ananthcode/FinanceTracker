import { SignOutRequest } from "@ft/core";
import { route } from "@/lib/api/handler";
import { audit } from "@/lib/audit";
import { adminSupabase } from "@/lib/supabase/admin";
import { LAST_ACTIVE_COOKIE } from "@/lib/session-cookies";
import { cookies } from "next/headers";

/** POST /api/auth/sign-out — ends the session on this device only (FR-011). */
export const POST = route(
  { auth: "user", name: "/api/auth/sign-out", body: SignOutRequest },
  async ({ body, user, supabase, bearerToken }) => {
    await audit("signed_out", {
      actorId: user!.id,
      actorRef: user!.email,
      targetType: "session",
      targetId: user!.id,
      device: body.device,
    });
    if (bearerToken) {
      await adminSupabase().auth.admin.signOut(bearerToken, "local");
    } else {
      await supabase!.auth.signOut({ scope: "local" });
      (await cookies()).delete(LAST_ACTIVE_COOKIE);
    }
    return new Response(null, { status: 204 });
  },
);
