import { useLocalSearchParams } from "expo-router";
import { TransactionEntry, type EntryKind } from "@/components/entry/TransactionEntry";
import { useMoney } from "@/components/providers/useLists";

/** Add a transaction (R4 US8 on the phone): `?kind=expense|income|transfer|refund|person`, `&from=<id>` repeats one. */
export default function AddScreen() {
  const { kind, from } = useLocalSearchParams<{ kind?: string; from?: string }>();
  const { transactions } = useMoney();
  const entryKind: EntryKind = kind === "income" || kind === "transfer" || kind === "refund" || kind === "person" ? kind : "expense";
  const prefill = from ? transactions.find((t) => t.id === from) : undefined;
  if (from && !prefill) return null;
  return <TransactionEntry key={prefill?.id ?? "new"} kind={entryKind} prefill={prefill} />;
}
