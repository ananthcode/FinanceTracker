import { useMemo } from "react";
import { movementsOf, type AccountView, type CategoryView, type Movement, type PayeeView, type TagView, type TransactionView } from "@ft/core";
import { accountFromRow } from "@/lib/sync/accounts";
import { categoryFromRow, payeeFromRow, tagFromRow } from "@/lib/sync/lists";
import { transactionFromRow } from "@/lib/sync/transactions";
import { useDisplay } from "./DisplayProvider";
import { useSync, useSyncedData } from "./SyncProvider";

/** The signed-in user's categories, payees and tags from the phone's store, re-read on change. */
export function useLists(): { categories: CategoryView[]; payees: PayeeView[]; tags: TagView[] } {
  const { rows } = useSync();
  const categories = useSyncedData(async () => (await rows("category")).map(categoryFromRow), [] as CategoryView[]);
  const payees = useSyncedData(async () => (await rows("payee")).map(payeeFromRow), [] as PayeeView[]);
  const tags = useSyncedData(async () => (await rows("tag")).map(tagFromRow), [] as TagView[]);
  return { categories, payees, tags };
}

/** Accounts and transactions from the phone's store, with the account movements for balances (R4). */
export function useMoney(): { accounts: AccountView[]; transactions: TransactionView[]; movements: Movement[] } {
  const { rows } = useSync();
  const { preferences } = useDisplay();
  const accounts = useSyncedData(async () => (await rows("account")).map((r) => accountFromRow(r, preferences.baseCurrency)), [] as AccountView[]);
  const transactions = useSyncedData(async () => (await rows("transaction")).map(transactionFromRow), [] as TransactionView[]);
  const movements = useMemo(() => {
    const types = new Map(accounts.map((a) => [a.id, a.type]));
    return movementsOf(transactions, (id) => types.get(id) ?? "bank");
  }, [accounts, transactions]);
  return { accounts, transactions, movements };
}
