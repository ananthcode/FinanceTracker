import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { TRANSACTION_KIND_TEXT } from "@ft/core";
import { TransactionEntry } from "@/components/entry/TransactionEntry";
import { useMoney } from "@/components/providers/useLists";
import { Screen } from "@/components/Screen";

/** Edit a transaction on the phone (R4 US8). Refunds, person movements, interest and splits are edited on the web for now. */
export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { transactions } = useMoney();
  const tx = transactions.find((t) => t.id === id);
  if (!tx) return null;
  if ((tx.kind !== "expense" && tx.kind !== "income" && tx.kind !== "transfer") || tx.lines.length > 0) {
    return (
      <Screen title={TRANSACTION_KIND_TEXT[tx.kind]}>
        <Text>{tx.lines.length > 0 ? "This transaction is split" : "This kind of transaction"} is edited on the web app for now.</Text>
      </Screen>
    );
  }
  return <TransactionEntry key={tx.id} kind={tx.kind} existing={tx} />;
}
