import { createServiceRoleClient } from "@ft/db";
import { newInvitationToken, toByteaHex } from "@ft/db/server";

/** Service-role client for integration-test setup against the local stack. Synthetic data only. */
export function testAdmin() {
  return createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Unique synthetic email per test run, e.g. asha.k3x9@example.com */
export function uniqueEmail(prefix = "user"): string {
  return `${prefix}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Inserts an invitation directly and returns its raw token (tests only — production never exposes it). */
export async function seedInvitation(
  email: string,
  opts: { status?: "pending" | "accepted" | "revoked" | "superseded"; expired?: boolean } = {},
): Promise<{ id: string; token: string }> {
  const { token, tokenHash } = newInvitationToken();
  const created = opts.expired ? new Date(Date.now() - 8 * 86_400_000) : new Date();
  const expires = new Date(created.getTime() + 7 * 86_400_000);
  const { data, error } = await testAdmin()
    .from("invitations")
    .insert({
      email,
      token_hash: toByteaHex(tokenHash),
      status: opts.status ?? "pending",
      created_at: created.toISOString(),
      expires_at: expires.toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedInvitation failed: ${error?.message}`);
  return { id: data.id as string, token };
}

export function androidRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ft-client": "android" },
    body: JSON.stringify(body),
  });
}

export const STRONG_PASSWORD = "violet-kettle-orbit-27";
