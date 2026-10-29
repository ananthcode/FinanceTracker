import type { ChangeResult } from "@ft/core";
import type { PushOutcome } from "@/lib/sync-client";

/** Plain-language messages for refused category, tag and payee changes (R3 contracts/sync-protocol.md). */
const MESSAGES: Partial<Record<NonNullable<ChangeResult["code"]>, string>> = {
  NAME_TAKEN: "That name is already used here. Choose another name.",
  LIMIT_REACHED: "You have reached the limit for this list.",
  NOT_FOUND: "This no longer exists. It may have been merged or deleted on another device.",
  INVALID_MOVE: "It can't be moved there.",
  INVALID_MERGE: "These two can't be merged.",
  HAS_SUBCATEGORIES: "Delete or move its sub-categories first.",
  HAS_ACTIVITY: "It has been used, so it can't be deleted. Hide or merge it instead.",
  BALANCE_NOT_ZERO: "Settle the balance to ₹0.00 first.",
  DATE_IN_FUTURE: "The date must be today or earlier.",
  VALIDATION_FAILED: "Some details are not valid. Check them and try again.",
};

/** The message for a push that failed or whose first change was refused; null when it was accepted. */
export function refusal(outcome: PushOutcome, fallback: string, overrides: typeof MESSAGES = {}): string | null {
  if (!outcome.ok) return outcome.error.message;
  const result = outcome.results[0];
  if (result?.status !== "rejected") return null;
  return (result.code && (overrides[result.code] ?? MESSAGES[result.code])) ?? fallback;
}
