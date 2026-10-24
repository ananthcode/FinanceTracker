import "server-only";
import type { AdminOverviewResponse } from "@ft/core";
import { ApiError } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { isExpired, type InvitationRow } from "@/lib/invitations";
import { adminSupabase, appRpc } from "@/lib/supabase/admin";

/**
 * Owner-admin operations (US4). Callers must already have verified that the requester is the
 * owner. Nothing here reads or returns financial data or preferences (FR-016).
 */
export interface Actor {
  id: string;
  email: string;
}

const rpcError = (message: string) => {
  if (message.includes("CANNOT_TARGET_OWNER")) return new ApiError(409, "CANNOT_TARGET_OWNER", "The owner can't be disabled or erased.");
  if (message.includes("NOT_DISABLED")) return new ApiError(409, "NOT_DISABLED", "This user isn't disabled.");
  if (message.includes("NOT_FOUND")) return new ApiError(404, "NOT_FOUND", "User not found.");
  return new Error("ADMIN_RPC_FAILED");
};

export async function adminOverview(): Promise<AdminOverviewResponse> {
  const db = adminSupabase();
  const [{ data: invitations, error: invError }, { data: users, error: userError }] = await Promise.all([
    db
      .from("invitations")
      .select("id, email, role, status, created_at, expires_at, accepted_user_id, delivery_status")
      .neq("status", "superseded")
      .order("created_at", { ascending: false })
      .limit(200),
    appRpc<Array<Record<string, string | null>>>("admin_list_users"),
  ]);
  if (invError || userError) throw new Error("ADMIN_OVERVIEW_FAILED");

  return {
    invitations: ((invitations ?? []) as InvitationRow[]).map((inv) => ({
      id: inv.id,
      email: inv.email,
      status: isExpired(inv) ? "expired" : inv.status,
      deliveryStatus: inv.delivery_status,
      createdAt: new Date(inv.created_at).toISOString(),
      expiresAt: new Date(inv.expires_at).toISOString(),
    })),
    users: (users ?? []).map((u) => ({
      id: u.user_id!,
      email: u.email!,
      displayName: u.display_name ?? null,
      status: u.status as "active" | "disabled",
      role: u.role as "owner" | "member",
      lastSignInAt: u.last_sign_in_at ? new Date(u.last_sign_in_at).toISOString() : null,
    })),
  };
}

export async function adminAuditFeed(cursor: number | null) {
  const { data, error } = await appRpc<Array<{ id: number; occurred_at: string; action: string; actor_ref: string | null; target_ref: string | null }>>(
    "admin_audit_feed",
    { p_cursor: cursor, p_limit: 50 },
  );
  if (error) throw new Error("ADMIN_AUDIT_FAILED");
  const items = (data ?? []).map((e) => ({
    id: e.id,
    occurredAt: new Date(e.occurred_at).toISOString(),
    action: e.action,
    actorRef: e.actor_ref,
    targetRef: e.target_ref,
  }));
  return { items, nextCursor: items.length === 50 ? items[items.length - 1]!.id : null };
}

export async function revokeInvitation(id: string, actor: Actor): Promise<void> {
  const { data, error } = await adminSupabase()
    .from("invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("email");
  if (error) throw new Error("REVOKE_FAILED");
  if (!data || data.length === 0) throw new ApiError(409, "NOT_PENDING", "Only pending invitations can be revoked.");
  await audit("invitation_revoked", {
    actorId: actor.id,
    actorRef: actor.email,
    targetType: "invitation",
    targetId: id,
    targetRef: data[0]!.email as string,
  });
}

/** Disable or re-enable (FR-015): status for immediate data cut-off + auth ban for sign-in/refresh. */
export async function setUserAccess(userId: string, status: "active" | "disabled", actor: Actor): Promise<void> {
  const { error } = await appRpc("set_user_status", { p_user: userId, p_status: status, p_actor: actor.id });
  if (error) throw rpcError(error.message);
  const { error: banError } = await adminSupabase().auth.admin.updateUserById(userId, {
    ban_duration: status === "disabled" ? "876000h" : "none",
  });
  if (banError) throw new Error("BAN_UPDATE_FAILED");
}

/** Permanent erasure with dual confirmation (FR-016a, constitution I/III as amended, SC-009). */
export async function eraseUser(userId: string, confirmEmail: string, actor: Actor): Promise<void> {
  const db = adminSupabase();
  const { data: target } = await db.from("profiles").select("email, role").eq("user_id", userId).maybeSingle();
  if (!target) throw new ApiError(404, "NOT_FOUND", "User not found.");
  if (target.role === "owner") throw new ApiError(409, "CANNOT_TARGET_OWNER", "The owner can't be disabled or erased.");
  if ((target.email as string).toLowerCase() !== confirmEmail.toLowerCase()) {
    throw new ApiError(422, "CONFIRMATION_MISMATCH", "The email you typed doesn't match this user.");
  }

  // 1. Remove identifiers from the audit trail and delete invitations/lockout records.
  const { data: ref, error } = await appRpc<string>("scrub_user_from_audit", { p_user: userId, p_email: target.email });
  if (error || !ref) throw error ? rpcError(error.message) : new Error("SCRUB_FAILED");
  // 2. Minimal erasure record: who, when, opaque reference.
  await audit("user_erased", { actorId: actor.id, actorRef: actor.email, targetType: "user", targetRef: ref });
  // 3. Delete the auth user; every user-owned table cascades.
  const { error: deleteError } = await db.auth.admin.deleteUser(userId);
  if (deleteError) throw new Error("USER_DELETE_FAILED");
}
