"use client";

/**
 * Browser-side API helper (T096). A `USER_INACTIVE` answer means the owner disabled this account:
 * leave immediately for the signed-out page (FR-015, SC-007).
 */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: { code: string; message: string } | null;
}

export async function apiFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, data: null, error: { code: "NETWORK", message: "You appear to be offline." } };
  }
  const json = res.status === 204 ? null : ((await res.json().catch(() => null)) as Record<string, unknown> | null);
  if (res.ok) return { ok: true, status: res.status, data: json as T, error: null };

  const error = (json?.error as { code: string; message: string } | undefined) ?? {
    code: "INTERNAL",
    message: "Something went wrong. Please try again.",
  };
  if (error.code === "USER_INACTIVE") window.location.replace("/signed-out?reason=inactive");
  return { ok: false, status: res.status, data: null, error };
}
