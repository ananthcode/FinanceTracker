import { createBrowserClient, createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";

/**
 * Supabase client factories (plan: packages/db). Apps pass configuration in; this package never
 * reads environment variables itself, so the same code serves demo and live (constitution VI).
 */
export interface PublicConfig {
  url: string;
  anonKey: string;
}

/** Browser client for the web app (publishable key only). */
export function createWebBrowserClient(config: PublicConfig): SupabaseClient {
  return createBrowserClient(config.url, config.anonKey);
}

/** Server client for Next.js (route handlers, server components, middleware) using auth cookies. */
export function createWebServerClient(config: PublicConfig, cookies: CookieMethodsServer): SupabaseClient {
  return createServerClient(config.url, config.anonKey, { cookies });
}

/** Client acting as a specific user via a bearer token (Android requests to the web API). */
export function createBearerClient(config: PublicConfig, accessToken: string): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Privileged client (service role). Server-only: refuses to run where `window` exists so the key
 * can never be bundled into a browser by mistake (constitution VI).
 */
export function createServiceRoleClient(url: string, serviceRoleKey: string): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("The service-role client must never be created in a browser.");
  }
  if (!serviceRoleKey) throw new Error("Missing service-role key.");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Android client: session persisted through the given secure storage adapter (FR-012). */
export function createMobileClient(config: PublicConfig, storage: SupportedStorage): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}
