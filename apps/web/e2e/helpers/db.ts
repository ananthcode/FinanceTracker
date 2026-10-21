import { createServiceRoleClient } from "@ft/db";
import { newInvitationToken, toByteaHex } from "@ft/db/server";

/**
 * E2E database helpers — LOCAL STACK ONLY. Every destructive helper refuses to run unless the
 * Supabase URL points at this machine, and touches only synthetic @example.com data.
 */
function assertLocal(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to touch a non-local database (${host}).`);
  }
  return url;
}

export function admin() {
  return createServiceRoleClient(assertLocal(), process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Removes all synthetic users and invitations from earlier runs. */
export async function resetSyntheticData(): Promise<void> {
  const db = admin();
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (u.email?.endsWith("@example.com")) await db.auth.admin.deleteUser(u.id);
  }
  await db.from("invitations").delete().like("email", "%@example.com");
}

export async function seedInvitation(
  email: string,
  opts: { role?: "owner" | "member"; status?: "pending" | "revoked"; expired?: boolean } = {},
): Promise<string> {
  const { token, tokenHash } = newInvitationToken();
  const created = opts.expired ? new Date(Date.now() - 8 * 86_400_000) : new Date();
  const { error } = await admin()
    .from("invitations")
    .insert({
      email,
      role: opts.role ?? "member",
      status: opts.status ?? "pending",
      token_hash: toByteaHex(tokenHash),
      created_at: created.toISOString(),
      expires_at: new Date(created.getTime() + 7 * 86_400_000).toISOString(),
    });
  if (error) throw new Error(error.message);
  return token;
}

/** First-run setup is US3; until then tests complete it directly. */
export async function completeSetup(email: string, displayName: string): Promise<void> {
  const { error } = await admin()
    .from("profiles")
    .update({ display_name: displayName, setup_completed_at: new Date().toISOString() })
    .eq("email", email);
  if (error) throw new Error(error.message);
}

export async function userExists(email: string): Promise<boolean> {
  const { count } = await admin().from("profiles").select("user_id", { count: "exact", head: true }).eq("email", email);
  return (count ?? 0) > 0;
}
