import { ErrorResponse, type ErrorCode } from "@ft/core";
import { mobileEnv } from "./env";
import { supabase } from "./supabase";

/** A failed API call mapped to the contract error shape (contracts/http-api.md). */
export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "NETWORK",
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiCallError";
  }
}

type ForcedSignOutReason = "inactive" | "removed";
let onForcedSignOut: ((reason: ForcedSignOutReason) => void) | undefined;

/** Registered by the auth gate: called when the server says this user may no longer use the app. */
export function setForcedSignOutHandler(handler: (reason: ForcedSignOutReason) => void): void {
  onForcedSignOut = handler;
}

/**
 * Calls the web server API (research R-07) with the user's bearer token. The `X-FT-Client` header
 * identifies the Android app for the server's CSRF rule (FR-036b).
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "X-FT-Client": "android", Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.auth !== false) {
    const { data } = await supabase().auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${mobileEnv().apiBaseUrl}${path}`, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiCallError(0, "NETWORK", "You appear to be offline.");
  }

  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => null);
  if (res.ok) return json as T;

  const parsed = ErrorResponse.safeParse(json);
  const err = parsed.success
    ? new ApiCallError(res.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.retryAfter)
    : new ApiCallError(res.status, "INTERNAL", "Something went wrong. Please try again.");

  if (err.code === "USER_INACTIVE") onForcedSignOut?.("inactive");
  else if (err.code === "UNAUTHENTICATED" && init.auth !== false) onForcedSignOut?.("removed");
  throw err;
}
