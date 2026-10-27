import { z } from "zod";
import { DATE_FORMATS } from "../dates";

/** Every error code returned by the server API (contracts/http-api.md). */
export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "USER_INACTIVE",
  "NOT_FOUND",
  "INTERNAL",
  "TRY_LATER",
  "INVITE_NOT_FOUND",
  "INVITE_EXPIRED",
  "INVITE_REVOKED",
  "INVITE_REQUIRED",
  "ALREADY_ACCEPTED",
  "EMAIL_MISMATCH",
  "WEAK_PASSWORD",
  "PRIVACY_NOTICE_REQUIRED",
  "INVALID_CREDENTIALS",
  "LOCKED",
  "SETUP_ALREADY_COMPLETE",
  "BASE_CURRENCY_LOCKED",
  "USER_EXISTS",
  "INVITE_PENDING",
  "INVALID_EMAIL",
  "NOT_RESENDABLE",
  "NOT_PENDING",
  "CANNOT_TARGET_OWNER",
  "NOT_DISABLED",
  "CONFIRMATION_MISMATCH",
  "ENVIRONMENT_MISMATCH",
  // R2 — accounts & sync (specs/002-accounts-balances/contracts/http-api.md)
  "NAME_TAKEN",
  "GROUP_NAME_TAKEN",
  "BALANCE_NOT_ZERO",
  "HAS_ACTIVITY",
  "LIMIT_REACHED",
  "DATE_IN_FUTURE",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ErrorResponse = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    errorId: z.string().optional(),
    retryAfter: z.number().int().nonnegative().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

/** Emails are compared case-insensitively everywhere (FR-005); we normalise to lower case. */
export const Email = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((e) => e.toLowerCase());

export const Device = z.enum(["web", "android"]);
export type Device = z.infer<typeof Device>;

export const Environment = z.enum(["demo", "live"]);
export type Environment = z.infer<typeof Environment>;

export const NumberFormatSchema = z.enum(["indian", "international"]);
export const DateFormatSchema = z.enum(DATE_FORMATS as [string, ...string[]]);

export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, "ISO 4217 code expected");

export const DisplayName = z.string().trim().min(1).max(50);

export const Uuid = z.uuid();
