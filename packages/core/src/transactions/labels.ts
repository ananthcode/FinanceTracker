/**
 * Plain-language descriptions of transactions (R4 FR-011, FR-016; contracts/client-transactions.md):
 * every movement is said in words, never shown by sign or colour alone.
 */
import type { PersonAction, TransactionKind, TransactionStatus, TransactionView } from "./types";

/** The person actions as the form and lists say them (FR-011). */
export const PERSON_ACTION_TEXT: Record<PersonAction, string> = {
  lent: "Lent to",
  repaid_to: "Repaid to",
  paid_on_behalf: "Paid on behalf of",
  borrowed: "Borrowed from",
  received_back: "Received back from",
  collected_on_behalf: "Collected on behalf of",
  adjustment: "Adjustment",
};

export const TRANSACTION_KIND_TEXT: Record<TransactionKind, string> = {
  expense: "Expense",
  income: "Income",
  refund: "Refund",
  transfer: "Transfer",
  person: "Person",
  interest: "Interest",
};

export const TRANSACTION_STATUS_TEXT: Record<TransactionStatus, string> = {
  uncleared: "Uncleared",
  cleared: "Cleared",
  follow_up: "Follow-up",
  void: "Void",
};

export interface LabelNames {
  account: (id: string) => string;
  payee: (id: string) => string;
}

type Labelled = Pick<TransactionView, "kind" | "flow" | "accountId" | "toAccountId" | "payeeId" | "personAction">;

/** "Spent at Fresh Mart", "Transferred from Everyday Savings to Rewards Card", "Lent to Ravi Kumar", … */
export function transactionLabel(tx: Labelled, names: LabelNames): string {
  const payee = tx.payeeId ? names.payee(tx.payeeId) : "";
  const withPayee = (words: string, joiner: string) => (payee ? `${words} ${joiner} ${payee}` : words);
  switch (tx.kind) {
    case "expense":
      return withPayee("Spent", "at");
    case "income":
      return withPayee("Received", "from");
    case "refund":
      return withPayee("Refund", "from");
    case "transfer":
      return `Transferred from ${tx.accountId ? names.account(tx.accountId) : ""} to ${tx.toAccountId ? names.account(tx.toAccountId) : ""}`;
    case "interest":
      return tx.flow === "out" ? `Interest charged to ${payee}` : `Interest owed to ${payee}`;
    case "person":
      if (!tx.personAction) return payee;
      if (tx.personAction === "adjustment") {
        return tx.flow === "out" ? `Adjustment: ${payee} owes you more` : `Adjustment: you owe ${payee} more`;
      }
      return `${PERSON_ACTION_TEXT[tx.personAction]} ${payee}`;
  }
}
