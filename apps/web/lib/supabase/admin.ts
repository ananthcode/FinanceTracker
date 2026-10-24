import "server-only";
import { createServiceRoleClient } from "@ft/db";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

let admin: ReturnType<typeof createServiceRoleClient> | undefined;

/** Privileged service-role client — server only (constitution VI). */
export function adminSupabase() {
  admin ??= createServiceRoleClient(publicEnv.supabaseUrl, serverEnv().serviceRoleKey);
  return admin;
}

/** Calls an RPC in the `app` schema with the service role. */
export function appRpc<T = unknown>(fn: string, args?: Record<string, unknown>) {
  return adminSupabase().schema("app").rpc(fn, args) as unknown as Promise<{ data: T | null; error: { message: string; code?: string } | null }>;
}
