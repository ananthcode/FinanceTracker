"use client";
import { createWebBrowserClient } from "@ft/db";
import { publicEnv } from "@/lib/env";

let client: ReturnType<typeof createWebBrowserClient> | undefined;

/** Browser Supabase client (publishable key only) — used for Google OAuth redirects. */
export function browserSupabase() {
  client ??= createWebBrowserClient({ url: publicEnv.supabaseUrl, anonKey: publicEnv.supabaseAnonKey });
  return client;
}
