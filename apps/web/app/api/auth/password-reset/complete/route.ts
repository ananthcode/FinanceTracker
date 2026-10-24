import { checkPassword, PASSWORD_PROBLEM_MESSAGES, PasswordResetComplete } from "@ft/core";
import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { appRpc } from "@/lib/supabase/admin";

/**
 * POST /api/auth/password-reset/complete — sets the new password using the recovery session from
 * the emailed link. Ends all of the user's other sessions; this one stays signed in (FR-010).
 */
export const POST = route(
  { auth: "user", name: "/api/auth/password-reset/complete", body: PasswordResetComplete },
  async ({ body, user, supabase, client }) => {
    const check = checkPassword(body.password, user!.email);
    if (!check.ok) throw new ApiError(422, "WEAK_PASSWORD", PASSWORD_PROBLEM_MESSAGES[check.reason]);

    const { error } = await supabase!.auth.updateUser({ password: body.password });
    if (error) {
      if (/different from the old|same password/i.test(error.message)) {
        throw new ApiError(422, "WEAK_PASSWORD", "Choose a password you haven't used before.");
      }
      throw new Error("PASSWORD_UPDATE_FAILED");
    }
    await supabase!.auth.signOut({ scope: "others" });
    await appRpc("clear_failed_sign_ins", { p_email: user!.email });
    await audit("password_reset_completed", {
      actorId: user!.id,
      actorRef: user!.email,
      targetType: "session",
      targetId: user!.id,
      device: client,
    });
    return new Response(null, { status: 204 });
  },
);
