import { SetupRequest } from "@ft/core";
import { completeSetup, getProfile, updatePreferences } from "@ft/db";
import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { loadMe } from "@/lib/me";
import { adminSupabase } from "@/lib/supabase/admin";

/**
 * POST /api/me/setup — first-run setup (US3, FR-020, FR-021). Preferences are written through the
 * user's own client (audited as them); completion is server-side so it cannot be skipped.
 */
export const POST = route(
  { auth: "user", name: "/api/me/setup", body: SetupRequest },
  async ({ body, user, supabase, client }) => {
    const profile = await getProfile(adminSupabase(), user!.id);
    if (!profile) throw new Error("PROFILE_NOT_FOUND");
    if (profile.setupComplete) {
      throw new ApiError(409, "SETUP_ALREADY_COMPLETE", "Setup is already complete. Change preferences in Settings.");
    }
    // FR-036e: the Google joining path records the privacy notice here.
    if (!profile.privacyNoticeShown && body.privacyNoticeShown !== true) {
      throw new ApiError(422, "PRIVACY_NOTICE_REQUIRED", "Please read the privacy notice before continuing.");
    }

    const { displayName } = body;
    const preferences = {
      baseCurrency: body.baseCurrency,
      numberFormat: body.numberFormat,
      dateFormat: body.dateFormat,
      fyStartMonth: body.fyStartMonth,
      timezone: body.timezone,
    };
    // Base currency can still be chosen here; the database locks it once setup completes.
    await updatePreferences(supabase!, user!.id, preferences);

    const completed = await completeSetup(adminSupabase(), user!.id, displayName, !profile.privacyNoticeShown);
    if (!completed) {
      throw new ApiError(409, "SETUP_ALREADY_COMPLETE", "Setup is already complete. Change preferences in Settings.");
    }
    await audit("setup_completed", {
      actorId: user!.id,
      actorRef: user!.email,
      targetType: "user",
      targetId: user!.id,
      device: client,
    });
    return Response.json(await loadMe(supabase!, user!.id));
  },
);
