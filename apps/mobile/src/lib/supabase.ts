import { AppState } from "react-native";
import { createMobileClient } from "@ft/db";
import { envResult } from "./env";
import { chunkedSecureStorage } from "./secure-storage";

/**
 * Android Supabase client. The session lives in secure storage so the app opens signed in, even
 * offline (FR-012). Created lazily so a misconfigured build can still show the config-error screen.
 */
let client: ReturnType<typeof createMobileClient> | undefined;

export function supabase() {
  if (!envResult.success) throw new Error("Invalid app configuration");
  if (!client) {
    client = createMobileClient(
      { url: envResult.data.supabaseUrl, anonKey: envResult.data.supabaseAnonKey },
      chunkedSecureStorage,
    );
    // Only refresh tokens while the app is in the foreground (Supabase guidance for React Native).
    AppState.addEventListener("change", (state) => {
      if (state === "active") client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }
  return client;
}
