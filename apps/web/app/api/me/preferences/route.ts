import { z } from "zod";
import { PreferencesUpdate } from "@ft/core";
import { updateDisplayName, updatePreferences } from "@ft/db";
import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { loadMe } from "@/lib/me";

/** Accepts `baseCurrency` only to answer it with a clear error (FR-021). */
const Body = z.union([PreferencesUpdate, z.object({ baseCurrency: z.unknown() }).loose()]);

/** PATCH /api/me/preferences — change display name and regional preferences (US3, FR-022–FR-025). */
export const PATCH = route({ auth: "user", name: "/api/me/preferences", body: Body }, async ({ body, user, supabase }) => {
  if ("baseCurrency" in body) {
    throw new ApiError(422, "BASE_CURRENCY_LOCKED", "Base currency is fixed once setup is complete.");
  }
  const { displayName, ...preferences } = body as z.infer<typeof PreferencesUpdate>;
  if (displayName !== undefined) await updateDisplayName(supabase!, user!.id, displayName);
  await updatePreferences(supabase!, user!.id, preferences);
  return Response.json(await loadMe(supabase!, user!.id));
});
