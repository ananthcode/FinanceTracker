/** Payee vocabulary (R3 data-model.md). Money is always `bigint` minor units. */
import type { InterestMode } from "../transactions/types";

export const PAYEE_KINDS = ["business", "person"] as const;
export type PayeeKind = (typeof PAYEE_KINDS)[number];

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
}
