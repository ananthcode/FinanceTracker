/** Transaction vocabulary (R4 data-model.md). Money is always `bigint` minor units. */

export const TRANSACTION_KINDS = ["expense", "income", "refund", "transfer", "person", "interest"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

/** Money out of / into the account (for adjustments and interest: the effect on the person). */
export const MONEY_FLOWS = ["out", "in"] as const;
export type MoneyFlow = (typeof MONEY_FLOWS)[number];

/** Out: the person owes the user more. In: the user owes the person more (FR-011). */
export const PERSON_ACTIONS_OUT = ["lent", "repaid_to", "paid_on_behalf"] as const;
export const PERSON_ACTIONS_IN = ["borrowed", "received_back", "collected_on_behalf"] as const;
export const PERSON_ACTIONS = [...PERSON_ACTIONS_OUT, ...PERSON_ACTIONS_IN, "adjustment"] as const;
export type PersonAction = (typeof PERSON_ACTIONS)[number];

export const TRANSACTION_STATUSES = ["uncleared", "cleared", "follow_up", "void"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const INTEREST_MODES = ["none", "automatic", "manual"] as const;
export type InterestMode = (typeof INTEREST_MODES)[number];

/** The flow a kind or person action implies; adjustments and interest carry their own. */
export function flowOf(kind: TransactionKind, personAction: PersonAction | null): MoneyFlow | null {
  if (kind === "expense" || kind === "transfer") return "out";
  if (kind === "income" || kind === "refund") return "in";
  if (kind === "person" && personAction && personAction !== "adjustment") {
    return (PERSON_ACTIONS_OUT as readonly string[]).includes(personAction) ? "out" : "in";
  }
  return null;
}

/** One split line (FR-012): a category share, or a person share (paid / collected on behalf of). */
export interface TransactionLine {
  id: string;
  amountMinor: bigint;
  categoryId: string | null;
  personId: string | null;
  personAction: "paid_on_behalf" | "collected_on_behalf" | null;
  notes: string | null;
  tagIds: string[];
}

/** A transaction as screens and the core read it (packages/db getTransaction / searchTransactions). */
export interface TransactionView {
  id: string;
  date: string;
  timeOfDay: string | null;
  kind: TransactionKind;
  flow: MoneyFlow;
  accountId: string | null;
  toAccountId: string | null;
  amountMinor: bigint;
  payeeId: string | null;
  personAction: PersonAction | null;
  categoryId: string | null;
  lines: TransactionLine[];
  tagIds: string[];
  notes: string | null;
  reference: string | null;
  status: TransactionStatus;
  confirmed: boolean;
  generated: boolean;
  interestMonth: string | null;
  userEdited: boolean;
  state: "active" | "deleted";
}

export interface PersonRateView {
  id: string;
  payeeId: string;
  /** `yyyy-MM-01` */
  effectiveMonth: string;
  /** Percent per month × 10⁴ (1.5 % → 15000). */
  rateE4: number;
}
