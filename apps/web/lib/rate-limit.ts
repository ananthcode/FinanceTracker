import "server-only";
import { createHash } from "node:crypto";
import { appRpc } from "@/lib/supabase/admin";

/** SHA-256 hex digest — rate-limit buckets never contain raw emails or addresses (FR-008a). */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type LimitKind = "reset" | "invite-lookup" | "sync-push" | "sync-pull" | "categories-start" | "interest-propose" | "data-action";

/** Returns true when allowed; false when the caller exceeded `max` hits within `windowSeconds`. */
export async function hitRateLimit(kind: LimitKind, key: string, windowSeconds: number, max: number): Promise<boolean> {
  const { data, error } = await appRpc<boolean>("rate_limit_hit", {
    p_bucket: `${kind}:${sha256Hex(key.toLowerCase())}`,
    p_window_seconds: windowSeconds,
    p_max_hits: max,
  });
  if (error) throw new Error("RATE_LIMIT_UNAVAILABLE");
  return data === true;
}
