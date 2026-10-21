import { AcceptInvitationRequest, checkPassword, PASSWORD_PROBLEM_MESSAGES } from "@ft/core";
import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { findByToken, isExpired, noteExpired } from "@/lib/invitations";
import { issuePasswordSession } from "@/lib/session";
import { adminSupabase } from "@/lib/supabase/admin";

/**
 * POST /api/invitations/{token}/accept — join with email + password (US1, FR-001–FR-007, FR-036e).
 * Possession of the valid link proves control of the invited email (FR-001a).
 */
export const POST = route<typeof AcceptInvitationRequest, { token: string }>(
  { auth: "none", name: "/api/invitations/[token]/accept", body: AcceptInvitationRequest },
  async ({ body, params, client }) => {
    const inv = await findByToken(params.token);
    if (!inv || inv.status === "superseded") {
      throw new ApiError(404, "INVITE_NOT_FOUND", "This invitation link isn't valid.");
    }
    if (inv.status === "revoked") {
      throw new ApiError(410, "INVITE_REVOKED", "This invitation was withdrawn. Ask the owner for a new one.");
    }
    if (isExpired(inv)) {
      await noteExpired(inv);
      throw new ApiError(410, "INVITE_EXPIRED", "This invitation has expired. Ask the owner for a new one.");
    }

    if (inv.status === "accepted") {
      // Idempotent retry (spec Edge Cases): the same person repeating a successful request signs in.
      const retry = await issuePasswordSession({ ...body, client });
      if (retry.ok) return Response.json(retry.session, { status: 201 });
      throw new ApiError(409, "ALREADY_ACCEPTED", "This invitation has already been used. Please sign in.");
    }

    if (body.email !== inv.email.toLowerCase()) {
      throw new ApiError(422, "EMAIL_MISMATCH", "This invitation is for a different email address.");
    }

    const check = checkPassword(body.password, body.email);
    if (!check.ok) throw new ApiError(422, "WEAK_PASSWORD", PASSWORD_PROBLEM_MESSAGES[check.reason]);

    // The Before User Created hook re-validates the invitation; the trigger creates the profile,
    // preferences and marks the invitation accepted.
    const { data: created, error } = await adminSupabase().auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });
    if (error || !created.user) {
      if (error?.message.includes("INVITE_REQUIRED")) {
        throw new ApiError(410, "INVITE_REVOKED", "This invitation is no longer valid. Ask the owner for a new one.");
      }
      throw new Error("USER_CREATE_FAILED");
    }

    await adminSupabase()
      .from("profiles")
      .update({ privacy_notice_shown_at: new Date().toISOString() })
      .eq("user_id", created.user.id);

    const signedIn = await issuePasswordSession({ ...body, client });
    if (!signedIn.ok) throw new Error("SIGN_IN_AFTER_ACCEPT_FAILED");
    return Response.json(signedIn.session, { status: 201 });
  },
);
