import { PasswordSignInRequest } from "@ft/core";
import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { issuePasswordSession } from "@/lib/session";
import { appRpc } from "@/lib/supabase/admin";

interface LockStatus {
  locked: boolean;
  retryAfter: number;
}

const locked = (retryAfter: number) =>
  new ApiError(
    423,
    "LOCKED",
    `Too many failed attempts. Try again in ${Math.max(1, Math.ceil(retryAfter / 60))} minute(s).`,
    retryAfter,
  );

/**
 * POST /api/auth/sign-in — email + password with per-email lockout (US2, FR-006, FR-009, R-05).
 * Messages never reveal whether the email has an account.
 */
export const POST = route(
  { auth: "none", name: "/api/auth/sign-in", body: PasswordSignInRequest },
  async ({ body, client }) => {
    const { data: status } = await appRpc<LockStatus>("sign_in_lock_status", { p_email: body.email });
    if (status?.locked) throw locked(status.retryAfter);

    const outcome = await issuePasswordSession({ ...body, client });
    if (outcome.ok) {
      await appRpc("clear_failed_sign_ins", { p_email: body.email });
      return Response.json(outcome.session);
    }

    if (outcome.reason === "inactive") throw new ApiError(401, "USER_INACTIVE", "Your access has been disabled. Contact the owner.");
    if (outcome.reason === "locked") {
      const { data: now } = await appRpc<LockStatus>("sign_in_lock_status", { p_email: body.email });
      throw locked(now?.retryAfter ?? 900);
    }

    const { data: after } = await appRpc<LockStatus>("register_failed_sign_in", { p_email: body.email });
    if (after?.locked) throw locked(after.retryAfter);
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  },
);
