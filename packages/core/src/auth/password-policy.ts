import { COMMON_PASSWORDS_10K } from "./common-passwords-10k";

/** Password rules (FR-007): ≥ 8 chars, not a common password, not the email's local part. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordProblem = "too_short" | "too_long" | "common" | "matches_email";

export type PasswordCheck = { ok: true } | { ok: false; reason: PasswordProblem };

let commonSet: Set<string> | undefined;

export function isCommonPassword(password: string): boolean {
  commonSet ??= new Set(COMMON_PASSWORDS_10K);
  return commonSet.has(password.toLowerCase());
}

export function checkPassword(password: string, email: string): PasswordCheck {
  if (password.length < PASSWORD_MIN_LENGTH) return { ok: false, reason: "too_short" };
  if (password.length > PASSWORD_MAX_LENGTH) return { ok: false, reason: "too_long" };
  const localPart = email.split("@")[0]?.toLowerCase() ?? "";
  if (localPart && password.toLowerCase() === localPart) return { ok: false, reason: "matches_email" };
  if (isCommonPassword(password)) return { ok: false, reason: "common" };
  return { ok: true };
}

export const PASSWORD_PROBLEM_MESSAGES: Record<PasswordProblem, string> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  common: "This password is too common. Choose something less predictable.",
  matches_email: "Don't use your email name as the password.",
};
