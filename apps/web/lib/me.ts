import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeResponse } from "@ft/core";
import { getPreferences, getProfile } from "@ft/db";
import { publicEnv } from "@/lib/env";

/** Builds the MeResponse (contracts/http-api.md) through the caller's own client — RLS applies. */
export async function loadMe(db: SupabaseClient, userId: string): Promise<MeResponse> {
  const [profile, preferences] = await Promise.all([getProfile(db, userId), getPreferences(db, userId)]);
  if (!profile || !preferences) throw new Error("ME_NOT_FOUND");
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    role: profile.role,
    setupComplete: profile.setupComplete,
    privacyNoticeShown: profile.privacyNoticeShown,
    preferences,
    environment: publicEnv.appEnv,
  };
}
