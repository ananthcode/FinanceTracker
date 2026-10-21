import "server-only";
import { InvitationToken, type InvitationLookup } from "@ft/core";
import {
  hashInvitationToken,
  INVITATION_TTL_DAYS,
  invitationEmail,
  invitationLink,
  maskEmail,
  newInvitationToken,
  toByteaHex,
} from "@ft/db/server";
import { ApiError } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { serverEnv } from "@/lib/env.server";
import { sendMail } from "@/lib/mailer";
import { adminSupabase } from "@/lib/supabase/admin";

export interface InvitationRow {
  id: string;
  email: string;
  role: "owner" | "member";
  status: "pending" | "accepted" | "revoked" | "superseded";
  created_at: string;
  expires_at: string;
  accepted_user_id: string | null;
  delivery_status: "sent" | "failed" | null;
}

const COLUMNS = "id, email, role, status, created_at, expires_at, accepted_user_id, delivery_status";

export function isExpired(inv: Pick<InvitationRow, "status" | "expires_at">, now = new Date()): boolean {
  return inv.status === "pending" && new Date(inv.expires_at) <= now;
}

/** Finds an invitation by its raw token (only the hash is stored — FR-003a). */
export async function findByToken(rawToken: string): Promise<InvitationRow | null> {
  if (!InvitationToken.safeParse(rawToken).success) return null;
  const { data } = await adminSupabase()
    .from("invitations")
    .select(COLUMNS)
    .eq("token_hash", toByteaHex(hashInvitationToken(rawToken)))
    .maybeSingle();
  return (data as InvitationRow | null) ?? null;
}

/** Records `invitation_expired` the first time an expired invitation is seen (FR-037, lazily). */
export async function noteExpired(inv: InvitationRow): Promise<void> {
  const { count } = await adminSupabase()
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("action", "invitation_expired")
    .eq("target_id", inv.id);
  if (!count) await audit("invitation_expired", { targetType: "invitation", targetId: inv.id, targetRef: inv.email });
}

/** Public status view for the invitee (contracts/http-api.md GET /api/invitations/{token}). */
export async function lookupInvitation(rawToken: string): Promise<InvitationLookup> {
  const inv = await findByToken(rawToken);
  if (!inv || inv.status === "superseded") {
    throw new ApiError(404, "INVITE_NOT_FOUND", "This invitation link isn't valid.");
  }
  let status: InvitationLookup["status"] = inv.status === "pending" ? "pending" : inv.status;
  if (isExpired(inv)) {
    status = "expired";
    await noteExpired(inv);
  }
  return { status, emailMasked: maskEmail(inv.email), expiresAt: new Date(inv.expires_at).toISOString() };
}

export interface CreatedInvitation {
  id: string;
  expiresAt: string;
  deliveryStatus: "sent" | "failed";
}

/** Emails a new invitation link and records the delivery status (FR-003, FR-003a, FR-003b). */
async function issue(
  email: string,
  role: "owner" | "member",
  actor: { id: string | null; email: string | null },
  action: "invitation_created" | "invitation_resent",
  supersedes?: string,
): Promise<CreatedInvitation> {
  const admin = adminSupabase();
  const { token, tokenHash } = newInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);

  if (supersedes) {
    await admin.from("invitations").update({ status: "superseded" }).eq("id", supersedes).eq("status", "pending");
  }
  const { data, error } = await admin
    .from("invitations")
    .insert({ email, role, token_hash: toByteaHex(tokenHash), invited_by: actor.id, expires_at: expiresAt.toISOString() })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") throw new ApiError(409, "INVITE_PENDING", "An invitation is already pending for this email.");
    throw new Error("INVITATION_INSERT_FAILED");
  }
  if (supersedes) await admin.from("invitations").update({ superseded_by: data.id }).eq("id", supersedes);

  const mail = invitationEmail(invitationLink(serverEnv().webBaseUrl, token), expiresAt);
  const deliveryStatus = await sendMail({ to: email, ...mail });
  await admin.from("invitations").update({ delivery_status: deliveryStatus }).eq("id", data.id);

  await audit(deliveryStatus === "sent" ? action : "invitation_delivery_failed", {
    actorId: actor.id,
    actorRef: actor.email,
    targetType: "invitation",
    targetId: data.id,
    targetRef: email,
    details: action === "invitation_resent" ? { supersedes } : {},
  });
  return { id: data.id as string, expiresAt: expiresAt.toISOString(), deliveryStatus };
}

/** Owner-admin invites a person (FR-001–FR-003b). */
export async function createInvitation(email: string, actor: { id: string; email: string }): Promise<CreatedInvitation> {
  const admin = adminSupabase();
  const { data: existing } = await admin.from("profiles").select("user_id").eq("email", email).maybeSingle();
  if (existing) throw new ApiError(409, "USER_EXISTS", "This person already has access.");

  const { data: pending } = await admin
    .from("invitations")
    .select("id, expires_at")
    .eq("email", email)
    .eq("status", "pending");
  const live = (pending ?? []).find((p) => new Date(p.expires_at as string) > new Date());
  if (live) throw new ApiError(409, "INVITE_PENDING", "An invitation is already pending for this email. Use resend.");
  // An expired pending row would block the unique index: supersede it with the new one.
  const stale = (pending ?? [])[0]?.id as string | undefined;
  return issue(email, "member", actor, "invitation_created", stale);
}

/** Owner-admin resends a pending or expired invitation (US4 T091 builds on this). */
export async function resendInvitation(id: string, actor: { id: string; email: string }): Promise<CreatedInvitation> {
  const { data } = await adminSupabase().from("invitations").select(COLUMNS).eq("id", id).maybeSingle();
  const inv = data as InvitationRow | null;
  if (!inv || inv.status !== "pending") {
    throw new ApiError(409, "NOT_RESENDABLE", "Only pending or expired invitations can be resent.");
  }
  return issue(inv.email, inv.role, actor, "invitation_resent", inv.id);
}
