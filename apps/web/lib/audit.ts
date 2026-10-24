import "server-only";
import { appRpc } from "@/lib/supabase/admin";

export type AuditAction =
  | "invitation_created"
  | "invitation_resent"
  | "invitation_revoked"
  | "invitation_accepted"
  | "invitation_expired"
  | "invitation_delivery_failed"
  | "owner_recovered"
  | "user_disabled"
  | "user_enabled"
  | "user_erased"
  | "sign_in_succeeded"
  | "sign_in_failed"
  | "sign_in_locked"
  | "password_reset_requested"
  | "password_reset_completed"
  | "signed_out"
  | "preference_changed"
  | "setup_completed"
  | "app_lock_enabled"
  | "app_lock_disabled";

export interface AuditEntry {
  actorId?: string | null;
  actorRef?: string | null;
  targetType?: "user" | "invitation" | "preferences" | "session" | null;
  targetId?: string | null;
  targetRef?: string | null;
  device?: "web" | "android" | null;
  /** Never secrets or financial data — the database also strips token/password/pin keys. */
  details?: Record<string, unknown>;
}

/** Appends an audit event (FR-037). Audit failures must not break the user's action. */
export async function audit(action: AuditAction, entry: AuditEntry = {}): Promise<void> {
  await appRpc("write_audit", {
    p_action: action,
    p_actor_id: entry.actorId ?? null,
    p_actor_ref: entry.actorRef ?? null,
    p_target_type: entry.targetType ?? null,
    p_target_id: entry.targetId ?? null,
    p_target_ref: entry.targetRef ?? null,
    p_device_type: entry.device ?? null,
    p_details: entry.details ?? {},
  });
}
