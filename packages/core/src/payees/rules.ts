/** Client-side payee merge rule mirroring app._apply_payee (FR-024); the server decides. */
import type { PayeeView } from "./types";

/** Payees may merge only into another payee of the same kind (business or person). */
export function canMergePayee(source: Pick<PayeeView, "id" | "kind">, target: Pick<PayeeView, "id" | "kind">): boolean {
  return source.id !== target.id && source.kind === target.kind;
}

/** The target's opening balance after a merge of two people: the two are added exactly. */
export function mergedOpeningBalance(source: Pick<PayeeView, "openingBalanceMinor">, target: Pick<PayeeView, "openingBalanceMinor">): bigint {
  return source.openingBalanceMinor + target.openingBalanceMinor;
}
