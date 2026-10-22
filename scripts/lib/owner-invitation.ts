/**
 * Shared by env-bootstrap (T044) and env-recover-owner (T097): issues an owner invitation and
 * emails the link. The token is only ever in the email — never printed.
 */
import nodemailer from "nodemailer";
import type { createServiceRoleClient } from "@ft/db";
import { INVITATION_TTL_DAYS, invitationEmail, invitationLink, newInvitationToken, toByteaHex } from "@ft/db/server";

type Admin = ReturnType<typeof createServiceRoleClient>;

export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}.`);
    process.exit(1);
  }
  return value;
}

/** Creates and emails an owner invitation. On delivery failure the invitation is revoked again. */
export async function sendOwnerInvitation(
  admin: Admin,
  email: string,
  actorRef: "env-bootstrap" | "env-recover-owner",
): Promise<{ delivery: "sent" | "failed"; expiresAt: Date }> {
  const { token, tokenHash } = newInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const { data: invitation, error: insertError } = await admin
    .from("invitations")
    .insert({ email, role: "owner", token_hash: toByteaHex(tokenHash), expires_at: expiresAt.toISOString() })
    .select("id")
    .single();
  if (insertError || !invitation) throw new Error(insertError?.message ?? "Insert failed");

  const transport = nodemailer.createTransport({
    host: required("SMTP_HOST"),
    port: Number(required("SMTP_PORT")),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  const mail = invitationEmail(invitationLink(required("WEB_BASE_URL"), token), expiresAt);
  let delivery: "sent" | "failed" = "sent";
  try {
    await transport.sendMail({ from: required("SMTP_FROM"), to: email, ...mail });
  } catch {
    delivery = "failed";
  }

  await admin.from("invitations").update({ delivery_status: delivery }).eq("id", invitation.id);
  await admin.schema("app").rpc("write_audit", {
    p_action: delivery === "sent" ? "invitation_created" : "invitation_delivery_failed",
    p_actor_id: null,
    p_actor_ref: actorRef,
    p_target_type: "invitation",
    p_target_id: invitation.id,
    p_target_ref: email,
    p_device_type: null,
    p_details: { role: "owner" },
  });

  if (delivery === "failed") {
    await admin.from("invitations").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", invitation.id);
  }
  return { delivery, expiresAt };
}
