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
import { createServiceRoleClient } from "@ft/db";
import { required, sendOwnerInvitation } from "./lib/owner-invitation";

async function main(): Promise<void> {
  const appEnv = required("APP_ENV");
  const supabaseUrl = process.env.SUPABASE_URL ?? required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const ownerEmail = required("OWNER_EMAIL").trim().toLowerCase();
  required("WEB_BASE_URL");

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

  const { delivery, expiresAt } = await sendOwnerInvitation(admin, ownerEmail, "env-bootstrap");
  if (delivery === "failed") {
    console.error("Owner invitation recorded, but the email could not be sent. Fix SMTP settings and re-run.");
    process.exit(1);
  }
  console.log(`Owner invitation emailed. It expires on ${expiresAt.toISOString().slice(0, 10)}.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "Bootstrap failed");
  process.exit(1);
});
