import { createHash, randomBytes } from "node:crypto";

/**
 * Server-only invitation helpers shared by the web API (T049) and environment scripts (T044, T097).
 * Never imported by the Android app (uses node:crypto).
 */

/** Invitation links expire 7 days after issue (FR-003). */
export const INVITATION_TTL_DAYS = 7;

export interface NewInvitationToken {
  /** Sent only in the email link — never stored, shown or logged (FR-003a). */
  token: string;
  /** SHA-256 of the token; the only form stored in the database. */
  tokenHash: Buffer;
}

/** 32 random bytes (256 bits ≥ the 128-bit requirement), base64url → 43 characters. */
export function newInvitationToken(): NewInvitationToken {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/** Postgres `bytea` hex literal for PostgREST filters/inserts. */
export function toByteaHex(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}

export function invitationLink(webBaseUrl: string, token: string): string {
  return `${new URL(webBaseUrl).origin}/invite/${token}`;
}

/** "a***@example.com" — shown to the invitee before joining (contracts/http-api.md). */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

export function invitationEmail(link: string, expiresAt: Date, appName = "Finance Tracker") {
  const expires = expiresAt.toISOString().slice(0, 10);
  const subject = `You're invited to ${appName}`;
  const text = [
    `You've been invited to ${appName}.`,
    "",
    `Open this link to join (valid until ${expires}):`,
    link,
    "",
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n");
  const html = `<p>You've been invited to <strong>${appName}</strong>.</p>
<p><a href="${link}">Join ${appName}</a> (valid until ${expires}).</p>
<p>If you weren't expecting this, you can ignore this email.</p>`;
  return { subject, text, html };
}
