import { z } from "zod";
import { Device, Email } from "./common";

/** Invitation token from the emailed link: 32 random bytes, base64url (43 chars). */
export const InvitationToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Malformed invitation token");

export const InvitationLookup = z.object({
  status: z.enum(["pending", "accepted", "expired", "revoked"]),
  emailMasked: z.string(),
  expiresAt: z.iso.datetime(),
});
export type InvitationLookup = z.infer<typeof InvitationLookup>;

export const AcceptInvitationRequest = z.object({
  email: Email,
  password: z.string().min(1).max(128),
  keepSignedIn: z.boolean().default(false),
  device: Device,
  privacyNoticeShown: z.literal(true),
});
export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationRequest>;

export const PasswordSignInRequest = z.object({
  email: Email,
  password: z.string().min(1).max(128),
  keepSignedIn: z.boolean().default(false),
  device: Device,
});
export type PasswordSignInRequest = z.infer<typeof PasswordSignInRequest>;

export const SessionUser = z.object({
  id: z.uuid(),
  email: z.string(),
  setupComplete: z.boolean(),
});

/** Web receives cookies instead of tokens; Android receives the tokens. */
export const SessionResponse = z.object({
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().int().optional(),
  user: SessionUser,
});
export type SessionResponse = z.infer<typeof SessionResponse>;

export const PasswordResetRequest = z.object({ email: Email });

export const PasswordResetComplete = z.object({ password: z.string().min(1).max(128) });

export const SignOutRequest = z.object({ device: Device });

export const SignInActivityItem = z.object({
  occurredAt: z.iso.datetime(),
  action: z.enum(["sign_in_succeeded", "sign_in_failed", "sign_in_locked", "signed_out"]),
  method: z.enum(["password", "google"]).nullable(),
  deviceType: Device.nullable(),
});
export const SignInActivityResponse = z.object({ items: z.array(SignInActivityItem) });
