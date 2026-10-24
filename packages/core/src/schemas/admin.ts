import { z } from "zod";
import { Email } from "./common";

export const CreateInvitationRequest = z.object({ email: Email });

export const CreateInvitationResponse = z.object({
  id: z.uuid(),
  expiresAt: z.iso.datetime(),
  deliveryStatus: z.enum(["sent", "failed"]),
});
export type CreateInvitationResponse = z.infer<typeof CreateInvitationResponse>;

export const AdminInvitation = z.object({
  id: z.uuid(),
  email: z.string(),
  status: z.enum(["pending", "accepted", "expired", "revoked", "superseded"]),
  deliveryStatus: z.enum(["sent", "failed"]).nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

/** Only the FR-014 fields — never preferences or financial data (FR-016). */
export const AdminUser = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
  status: z.enum(["active", "disabled"]),
  role: z.enum(["owner", "member"]),
  lastSignInAt: z.iso.datetime().nullable(),
});

export const AdminOverviewResponse = z.object({
  invitations: z.array(AdminInvitation),
  users: z.array(AdminUser),
});
export type AdminOverviewResponse = z.infer<typeof AdminOverviewResponse>;

export const EraseUserRequest = z.object({ confirmEmail: Email });

export const AdminAuditItem = z.object({
  id: z.number().int(),
  occurredAt: z.iso.datetime(),
  action: z.string(),
  actorRef: z.string().nullable(),
  targetRef: z.string().nullable(),
});
export const AdminAuditResponse = z.object({
  items: z.array(AdminAuditItem),
  nextCursor: z.number().int().nullable(),
});
export type AdminAuditResponse = z.infer<typeof AdminAuditResponse>;
