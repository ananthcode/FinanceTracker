import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { categoryPath, indexCategories, PERSON_ACTION_TEXT, TRANSACTION_KIND_TEXT, TRANSACTION_STATUS_TEXT, type TransactionView } from "@ft/core";
import { TransactionEntry } from "@/components/entry/TransactionEntry";
import { Money } from "@/components/Money";
import { useLists, useMoney } from "@/components/providers/useLists";
import { Screen } from "@/components/Screen";
import { colours } from "@/lib/theme";

/**
 * A transaction on the phone (R4 US8). Expenses, income, refunds, transfers and lent / borrowed /
 * repaid movements are edited here; splits, adjustments and interest are shown and edited on the web.
 */
export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { transactions } = useMoney();
  const tx = transactions.find((t) => t.id === id);
  if (!tx) return null;
  const editable =
    tx.lines.length === 0 &&
    (["expense", "income", "refund", "transfer"].includes(tx.kind) || (tx.kind === "person" && tx.personAction !== null && tx.personAction !== "adjustment"));
  if (editable) return <TransactionEntry key={tx.id} kind={tx.kind as "expense"} existing={tx} />;
  return <ReadOnly tx={tx} />;
}

function ReadOnly({ tx }: { tx: TransactionView }) {
  const { categories, payees, tags } = useLists();
  const { accounts } = useMoney();
  const index = indexCategories(categories);
  const name = (id: string | null) => (id ? (payees.find((p) => p.id === id)?.name ?? accounts.find((a) => a.id === id)?.name ?? "") : "");
  const row = (label: string, value: React.ReactNode) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: colours.line }}>
      <Text style={{ color: colours.muted }}>{label}</Text>
      <Text style={{ color: colours.text, fontWeight: "600", flexShrink: 1, textAlign: "right" }}>{value}</Text>
    </View>
  );
  return (
    <Screen title={tx.lines.length > 0 ? `Split (${tx.lines.length})` : TRANSACTION_KIND_TEXT[tx.kind]}>
      <Money value={tx.amountMinor} style={{ fontSize: 32, fontWeight: "700", color: colours.text }} />
      <View>
        {row("Date", tx.date)}
        {tx.accountId && row(tx.flow === "in" ? "Into" : "From", name(tx.accountId))}
        {tx.payeeId && row(tx.personAction ? PERSON_ACTION_TEXT[tx.personAction] : "Payee", name(tx.payeeId))}
        {tx.interestMonth && row("Interest for", tx.interestMonth.slice(0, 7))}
        {row("Status", `${TRANSACTION_STATUS_TEXT[tx.status]}${tx.confirmed ? "" : " · To confirm"}`)}
        {tx.tagIds.length > 0 && row("Tags", tx.tagIds.map((t) => tags.find((x) => x.id === t)?.name).filter(Boolean).join(", "))}
        {tx.notes && row("Note", tx.notes)}
      </View>
      {tx.lines.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: "600" }}>
            Lines
          </Text>
          {tx.lines.map((l) => (
            <View key={l.id} style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: colours.card, borderRadius: 12, padding: 12 }}>
              <Text style={{ flex: 1 }}>{l.personId ? `${PERSON_ACTION_TEXT[l.personAction!]} ${name(l.personId)}` : l.categoryId ? categoryPath(l.categoryId, index) : "Uncategorised"}</Text>
              <Money value={l.amountMinor} style={{ fontWeight: "600" }} />
            </View>
          ))}
        </View>
      )}
      <Text style={{ color: colours.muted }}>
        {tx.lines.length > 0 ? "Split transactions" : "This kind of transaction"} are edited on the web app for now.
      </Text>
    </Screen>
  );
}
