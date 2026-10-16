import { z } from "zod";
import { Environment, isSecureOrLocalUrl } from "@ft/core";

export { isSecureOrLocalUrl };

const SecureUrl = z
  .string()
  .refine(isSecureOrLocalUrl, "Must be an https:// URL (plain http only for local development)");

const PublicEnv = z.object({
  appEnv: Environment,
  supabaseUrl: SecureUrl,
  supabaseAnonKey: z.string().min(1),
});

/**
 * Publishable configuration, safe for the browser. NEXT_PUBLIC_* variables must be referenced
 * literally so Next.js can inline them.
 */
export const publicEnv = PublicEnv.parse({
  appEnv: process.env.NEXT_PUBLIC_APP_ENV,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
