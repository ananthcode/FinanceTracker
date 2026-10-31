/** Payee vocabulary (R3 data-model.md). Money is always `bigint` minor units. */
import type { InterestMode } from "../transactions/types";

export const PAYEE_KINDS = ["business", "person"] as const;
export type PayeeKind = (typeof PAYEE_KINDS)[number];

/** Which direction a person's statement shows as positive (R6 FR-010). */
export const STATEMENT_SIGNS = ["they_owe_positive", "i_owe_positive"] as const;
export type StatementSign = (typeof STATEMENT_SIGNS)[number];

/**
 * A payee as the screens read it (packages/db listPayees; deleted rows excluded). For a person,
 * `openingBalanceMinor` is positive when they owe the user and negative when the user owes them.
 */
export interface PayeeView {
  id: string;
  name: string;
  kind: PayeeKind;
  defaultCategoryId: string | null;
  notes: string | null;
  hidden: boolean;
  openingBalanceMinor: bigint;
  openingBalanceDate: string | null;
  includeInNetWorth: boolean;
  /** People only (R4 FR-013). */
  interestMode: InterestMode;
  /** People only (R6 FR-010). */
  statementSign: StatementSign;
}
