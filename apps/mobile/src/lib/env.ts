import { z } from "zod";
import { Environment, isSecureOrLocalUrl } from "@ft/core";

const SecureUrl = z
  .string()
  .refine(isSecureOrLocalUrl, "Must be an https:// URL (plain http only for local development) — FR-036a");

const MobileEnvSchema = z.object({
  appEnv: Environment,
  supabaseUrl: SecureUrl,
  supabaseAnonKey: z.string().min(1),
  apiBaseUrl: SecureUrl,
});

export type MobileEnv = z.infer<typeof MobileEnvSchema>;

/** Result of reading build-time configuration; never throws so the app can show an error screen. */
export const envResult = MobileEnvSchema.safeParse({
  // EXPO_PUBLIC_* must be referenced literally so Expo inlines them at build time.
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
});

export function mobileEnv(): MobileEnv {
  if (!envResult.success) throw new Error("Invalid app configuration");
  return envResult.data;
}
