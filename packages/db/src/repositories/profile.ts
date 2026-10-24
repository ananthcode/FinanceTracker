import type { SupabaseClient } from "@supabase/supabase-js";

/** Profile repository (T080). Role, status and setup completion are written server-side only. */
export interface ProfileView {
  id: string;
  email: string;
  displayName: string | null;
  role: "owner" | "member";
  status: "active" | "disabled";
  setupComplete: boolean;
  privacyNoticeShown: boolean;
}

interface ProfileRow {
  user_id: string;
  email: string;
  display_name: string | null;
  role: ProfileView["role"];
  status: ProfileView["status"];
  setup_completed_at: string | null;
  privacy_notice_shown_at: string | null;
}

const COLUMNS = "user_id, email, display_name, role, status, setup_completed_at, privacy_notice_shown_at";

export async function getProfile(db: SupabaseClient, userId: string): Promise<ProfileView | null> {
  const { data, error } = await db.from("profiles").select(COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`PROFILE_READ_FAILED: ${error.code ?? ""}`);
  if (!data) return null;
  const row = data as ProfileRow;
  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    setupComplete: row.setup_completed_at !== null,
    privacyNoticeShown: row.privacy_notice_shown_at !== null,
  };
}

/** Display name is the one profile field users may change themselves (RLS + column grant). */
export async function updateDisplayName(db: SupabaseClient, userId: string, displayName: string): Promise<void> {
  const { error } = await db.from("profiles").update({ display_name: displayName.trim() }).eq("user_id", userId);
  if (error) throw new Error("PROFILE_UPDATE_FAILED");
}

/**
 * Marks first-run setup complete (service role only). Returns false when it was already complete,
 * so concurrent requests cannot both succeed.
 */
export async function completeSetup(
  admin: SupabaseClient,
  userId: string,
  displayName: string,
  recordPrivacyNotice: boolean,
): Promise<boolean> {
  const now = new Date().toISOString();
  const update: Record<string, string> = { display_name: displayName.trim(), setup_completed_at: now };
  if (recordPrivacyNotice) update.privacy_notice_shown_at = now;
  const { data, error } = await admin
    .from("profiles")
    .update(update)
    .eq("user_id", userId)
    .is("setup_completed_at", null)
    .select("user_id");
  if (error) throw new Error("SETUP_UPDATE_FAILED");
  return (data ?? []).length === 1;
}
