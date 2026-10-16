import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

type GuardResult = "ok" | "mismatch" | "unavailable";

let cache: { result: GuardResult; at: number } | undefined;
const TTL_MS = 5 * 60_000;

/**
 * FR-019a: this deployment must talk to a backend of the same environment. Also detects an
 * unreachable/paused backend so the app can show "service temporarily unavailable".
 */
export async function checkEnvironment(): Promise<GuardResult> {
  if (cache && Date.now() - cache.at < TTL_MS && cache.result === "ok") return cache.result;
  let result: GuardResult;
  try {
    const anon = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.schema("app").rpc("health");
    if (error || !data) result = "unavailable";
    else result = (data as { environment?: string }).environment === publicEnv.appEnv ? "ok" : "mismatch";
  } catch {
    result = "unavailable";
  }
  cache = { result, at: Date.now() };
  return result;
}
