/**
 * T097 — Owner-admin recovery (FR-013a, research R-22).
 *
 * Run by the person operating the environment when the owner-admin has lost every sign-in method:
 *   pnpm env:recover-owner --new-email <email>
 * Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WEB_BASE_URL and SMTP_* like env-bootstrap.
 *
 * - If <email> already belongs to a user, the owner role moves to that user now (app.transfer_owner)
 *   and their access is re-enabled.
 * - Otherwise an owner invitation is emailed; the role moves when it is accepted.
 * Either way the move is audited as `owner_recovered`, the previous owner becomes an ordinary member,
 * and no other user's data is read or changed.
 */
import { parseArgs } from "node:util";
import { createServiceRoleClient } from "@ft/db";
import { required, sendOwnerInvitation } from "./lib/owner-invitation";

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { "new-email": { type: "string" } } });
  const newEmail = values["new-email"]?.trim().toLowerCase();
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    console.error("Usage: pnpm env:recover-owner --new-email <email>");
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? required("NEXT_PUBLIC_SUPABASE_URL");
  const admin = createServiceRoleClient(supabaseUrl, required("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: target, error: lookupError } = await admin
    .from("profiles")
    .select("user_id, role")
    .eq("email", newEmail)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  // Any earlier owner invitation must not be able to take the role later.
  const { error: revokeError } = await admin
    .from("invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("status", "pending")
    .eq("role", "owner");
  if (revokeError) throw new Error(revokeError.message);

  if (target?.role === "owner") {
    console.log("That email already belongs to the owner-admin — nothing else to do.");
    return;
  }

  if (target) {
    const { error } = await admin.schema("app").rpc("transfer_owner", { p_new_owner: target.user_id });
    if (error) throw new Error(error.message);
    // transfer_owner re-activates the profile; lift any sign-in ban from an earlier disable.
    const { error: banError } = await admin.auth.admin.updateUserById(target.user_id, { ban_duration: "none" });
    if (banError) throw new Error(banError.message);
    console.log("Owner role moved to the existing account. They can open User management after signing in again.");
    return;
  }

  // No account yet: invite. The new email may have a pending member invitation; the owner invitation supersedes it.
  await admin.from("invitations").update({ status: "superseded" }).eq("status", "pending").eq("email", newEmail);

  const { delivery, expiresAt } = await sendOwnerInvitation(admin, newEmail, "env-recover-owner");
  if (delivery === "failed") {
    console.error("Owner invitation recorded, but the email could not be sent. Fix SMTP settings and re-run.");
    process.exit(1);
  }
  console.log(
    `Owner invitation emailed. The role moves when it is accepted (expires ${expiresAt.toISOString().slice(0, 10)}).`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "Recovery failed");
  process.exit(1);
});
