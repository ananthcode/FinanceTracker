/**
 * T044 — Environment bootstrap (FR-013, FR-019a, research R-13).
 *
 * Run once per environment by the person operating it:
 *   pnpm env:bootstrap
 * Reads configuration from the environment (locally: apps/web/.env.local):
 *   APP_ENV, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_EMAIL, WEB_BASE_URL, SMTP_*
 *
 * 1. Records the environment name in the database (refuses if it belongs to another environment).
 * 2. Invites OWNER_EMAIL as the single owner-admin and emails the link.
 * The invitation token is only ever in the email — this script never prints it.
 */
import nodemailer from "nodemailer";
import { createServiceRoleClient } from "@ft/db";
import { INVITATION_TTL_DAYS, invitationEmail, invitationLink, newInvitationToken, toByteaHex } from "@ft/db/server";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}.`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const appEnv = required("APP_ENV");
  const supabaseUrl = process.env.SUPABASE_URL ?? required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const ownerEmail = required("OWNER_EMAIL").trim().toLowerCase();
  const webBaseUrl = required("WEB_BASE_URL");

  const admin = createServiceRoleClient(supabaseUrl, serviceKey);

  // 1. Environment identity.
  const { error: envError } = await admin.schema("app").rpc("set_environment", { p_name: appEnv });
  if (envError) {
    console.error(`Could not set environment: ${envError.message}`);
    process.exit(1);
  }
  console.log(`Environment recorded: ${appEnv}`);

  // 2. Single owner-admin.
  const { data: owners, error: ownerError } = await admin.from("profiles").select("user_id").eq("role", "owner");
  if (ownerError) throw new Error(ownerError.message);
  if (owners && owners.length > 0) {
    console.log("An owner-admin already exists — nothing to do.");
    return;
  }

  const { data: pending } = await admin
    .from("invitations")
    .select("id")
    .eq("status", "pending")
    .eq("role", "owner")
    .gt("expires_at", new Date().toISOString());
  if (pending && pending.length > 0) {
    console.log("An owner invitation is already pending. Ask the owner to use the emailed link.");
    return;
  }

  const { token, tokenHash } = newInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const { data: invitation, error: insertError } = await admin
    .from("invitations")
    .insert({ email: ownerEmail, role: "owner", token_hash: toByteaHex(tokenHash), expires_at: expiresAt.toISOString() })
    .select("id")
    .single();
  if (insertError || !invitation) throw new Error(insertError?.message ?? "Insert failed");

  const transport = nodemailer.createTransport({
    host: required("SMTP_HOST"),
    port: Number(required("SMTP_PORT")),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  const mail = invitationEmail(invitationLink(webBaseUrl, token), expiresAt);
  let delivery: "sent" | "failed" = "sent";
  try {
    await transport.sendMail({ from: required("SMTP_FROM"), to: ownerEmail, ...mail });
  } catch {
    delivery = "failed";
  }

  await admin.from("invitations").update({ delivery_status: delivery }).eq("id", invitation.id);
  await admin.schema("app").rpc("write_audit", {
    p_action: delivery === "sent" ? "invitation_created" : "invitation_delivery_failed",
    p_actor_id: null,
    p_actor_ref: "env-bootstrap",
    p_target_type: "invitation",
    p_target_id: invitation.id,
    p_target_ref: ownerEmail,
    p_device_type: null,
    p_details: { role: "owner" },
  });

  if (delivery === "failed") {
    console.error("Owner invitation recorded, but the email could not be sent. Fix SMTP settings and re-run.");
    await admin.from("invitations").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", invitation.id);
    process.exit(1);
  }
  console.log(`Owner invitation emailed. It expires on ${expiresAt.toISOString().slice(0, 10)}.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "Bootstrap failed");
  process.exit(1);
});
