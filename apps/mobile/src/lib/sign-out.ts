import { api } from "./api";
import { localData } from "./local-data";
import { supabase } from "./supabase";

export type UnsentChoice = "send" | "discard" | "cancel";

/**
 * Signs out of this phone only (FR-011). If changes made offline have not been sent, the user is
 * asked first: "Send now" or "Sign out anyway (discard)". Nothing is discarded without that
 * explicit confirmation (spec Edge Cases, constitution IV).
 */
export async function signOutOfThisPhone(askAboutUnsent: (count: number) => Promise<UnsentChoice>): Promise<boolean> {
  const client = supabase();
  const userId = (await client.auth.getSession()).data.session?.user.id;
  if (!userId) return true;

  const pending = await localData.pendingCount(userId);
  if (pending > 0) {
    const choice = await askAboutUnsent(pending);
    if (choice === "cancel") return false;
    if (choice === "send") {
      // Send now; sign out only if everything went (otherwise the user is asked again).
      if ((await localData.flush(userId)) > 0) return false;
    } else {
      await localData.wipeAll(userId); // explicit "discard" confirmation given
    }
  }

  // Record the sign-out and end this session server-side; still sign out locally when offline.
  await api("/api/auth/sign-out", { body: { device: "android" } }).catch(() => undefined);
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  return true;
}
