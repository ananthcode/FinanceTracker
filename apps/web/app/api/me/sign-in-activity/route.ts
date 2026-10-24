import { route } from "@/lib/api/handler";

/**
 * GET /api/me/sign-in-activity — the caller's own recent sign-ins, failures and lockouts (FR-039).
 * Read through the caller's own client: RLS returns only their sign-in events.
 */
export const GET = route({ auth: "user", name: "/api/me/sign-in-activity" }, async ({ supabase, request }) => {
  const limit = Math.min(50, Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? 20) || 20));
  const { data, error } = await supabase!
    .from("audit_events")
    .select("occurred_at, action, device_type, details")
    .in("action", ["sign_in_succeeded", "sign_in_failed", "sign_in_locked", "signed_out"])
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("ACTIVITY_READ_FAILED");

  const items = (data ?? []).map((row) => {
    const method = (row.details as { method?: string } | null)?.method;
    return {
      occurredAt: new Date(row.occurred_at as string).toISOString(),
      action: row.action,
      method: method === "google" || method === "password" ? method : null,
      deviceType: row.device_type ?? null,
    };
  });
  return Response.json({ items });
});
