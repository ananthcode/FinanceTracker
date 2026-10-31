import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { PanResponder, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { categoryPath, indexCategories, summarise, todayInZone, TRANSACTION_KIND_TEXT, type TransactionView } from "@ft/core";
import { MenuSheet } from "@/components/home/MenuSheet";
import { Money } from "@/components/Money";
import { useDisplay } from "@/components/providers/DisplayProvider";
import { useSession } from "@/components/providers/SessionProvider";
import { useLists, useMoney } from "@/components/providers/useLists";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { byDay, monthSummary, type HomeFilter } from "@/lib/sync/transactions";
import { colours } from "@/lib/theme";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Home — where the app opens (docs/ANDROID-HOME.md; R4 US8 on the phone). Total balance, the
 * month's Income and Expenses cards (tap to filter the list), cashflow and the month's transactions
 * by day — all from the phone's store, so it works offline. Dragging down from the top opens the
 * menu; the menu button does the same for TalkBack users.
 */
export default function HomeScreen() {
  const { me } = useSession();
  const { preferences, hideBalances, setHideBalances } = useDisplay();
  const { payees, categories } = useLists();
  const { accounts, transactions, movements } = useMoney();
  const people = payees.filter((p) => p.kind === "person");
  const total = summarise(accounts, { view: "by_type", movements, people }).netWorth;
  const [menu, setMenu] = useState(false);
  const [month, setMonth] = useState(() => todayInZone(preferences.timezone).slice(0, 7));
  const [filter, setFilter] = useState<HomeFilter>("all");
  const summary = monthSummary(transactions, month);
  const days = byDay(transactions, month, filter);
  const toConfirm = transactions.filter((t) => t.state === "active" && !t.confirmed).length;
  const monthName = `${MONTHS[Number(month.slice(5)) - 1]}${month.slice(0, 4) === todayInZone(preferences.timezone).slice(0, 4) ? "" : ` ${month.slice(0, 4)}`}`;

  const pull = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 2,
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 50) setMenu(true);
        },
      }),
    [],
  );

  const card = (which: "income" | "expenses") => {
    const on = filter === which;
    const income = which === "income";
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityHint={on ? "Shows all transactions" : `Shows only ${which}`}
        onPress={() => setFilter(on ? "all" : which)}
        style={{ flex: 1, backgroundColor: income ? colours.income : colours.expense, borderRadius: 16, padding: 14, gap: 4, borderWidth: 3, borderColor: on ? colours.actionLight : "transparent" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <SymbolView name={income ? { ios: "arrow.down.left", android: "south_west" } : { ios: "arrow.up.right", android: "north_east" }} size={16} tintColor="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>{income ? "Income" : "Expenses"}</Text>
          {on && <Text style={{ color: "#FFFFFF", fontSize: 12, marginLeft: "auto" }}>Filtered</Text>}
        </View>
        <Money value={income ? summary.income : summary.expenses} style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "700" }} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colours.page }}>
      <View {...pull.panHandlers} style={{ paddingHorizontal: 16, paddingTop: 6 }}>
        <View style={{ height: 5, width: 36, backgroundColor: "#D3D1C7", borderRadius: 3, alignSelf: "center", marginBottom: 8 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: "600", color: colours.text, flex: 1 }} numberOfLines={1}>
            Hi {me?.displayName ?? "there"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colours.card, borderWidth: 1, borderColor: colours.line, borderRadius: 16 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={6} onPress={() => setMonth(shiftMonth(month, -1))} style={{ paddingHorizontal: 8, paddingVertical: 5 }}>
              <Text style={{ fontSize: 16 }}>‹</Text>
            </Pressable>
            <Text style={{ fontWeight: "600", color: colours.text }}>{monthName}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" hitSlop={6} onPress={() => setMonth(shiftMonth(month, 1))} style={{ paddingHorizontal: 8, paddingVertical: 5 }}>
              <Text style={{ fontSize: 16 }}>›</Text>
            </Pressable>
          </View>
          <Pressable testID="hide-balances" accessibilityRole="switch" accessibilityLabel="Hide balances" accessibilityState={{ checked: hideBalances }} hitSlop={8} onPress={() => setHideBalances(!hideBalances)}>
            <SymbolView name={hideBalances ? { ios: "eye.slash", android: "visibility_off" } : { ios: "eye", android: "visibility" }} size={24} tintColor={colours.action} />
          </Pressable>
          <Pressable testID="open-menu" accessibilityRole="button" accessibilityLabel="Open menu" hitSlop={8} onPress={() => setMenu(true)}>
            <SymbolView name={{ ios: "line.3.horizontal", android: "menu" }} size={26} tintColor={colours.text} />
          </Pressable>
        </View>
        <Text style={{ color: colours.muted, marginTop: 10 }}>Total balance</Text>
        <Money value={total} style={{ fontSize: 34, fontWeight: "700", color: colours.text }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <SyncStatusBar />
        <View style={{ flexDirection: "row", gap: 10 }}>
          {card("income")}
          {card("expenses")}
        </View>
        <Text style={{ color: summary.cashflow < 0n ? colours.danger : colours.incomeInk, fontWeight: "600" }}>
          Cashflow: {summary.cashflow < 0n ? "−" : "+"}
          <Money value={summary.cashflow < 0n ? -summary.cashflow : summary.cashflow} style={{ color: summary.cashflow < 0n ? colours.danger : colours.incomeInk, fontWeight: "600" }} />
        </Text>
        {toConfirm > 0 && (
          <View style={{ backgroundColor: "#FAEEDA", borderRadius: 14, padding: 12 }}>
            <Text style={{ color: "#633806", fontWeight: "600" }}>{toConfirm === 1 ? "1 transaction" : `${toConfirm} transactions`} to confirm</Text>
            <Text style={{ color: "#633806", fontSize: 12 }}>Upcoming or generated entries; confirm them on the web for now.</Text>
          </View>
        )}
        {days.length === 0 && (
          <View style={{ backgroundColor: colours.card, borderRadius: 16, padding: 16, gap: 6 }}>
            <Text style={{ fontWeight: "600", fontSize: 16, color: colours.text }}>Nothing in {monthName} yet</Text>
            <Text style={{ color: colours.muted }}>Tap + to record what you spend or receive. It works offline too.</Text>
          </View>
        )}
        {days.map((d) => (
          <View key={d.date} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              <Text style={{ fontWeight: "600", color: colours.text }}>{dayLabel(d.date, todayInZone(preferences.timezone))}</Text>
              <SignedMoney value={d.net} />
            </View>
            {d.items.map((t) => (
              <TxRow key={t.id} tx={t} names={{ categories, payees, accounts }} />
            ))}
          </View>
        ))}
      </ScrollView>
      <MenuSheet visible={menu} onClose={() => setMenu(false)} />
    </SafeAreaView>
  );
}

function dayLabel(date: string, today: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const y = new Date(`${today}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (date === today) return `Today, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!.slice(0, 3)}`;
  if (date === y.toISOString().slice(0, 10)) return `Yesterday, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!.slice(0, 3)}`;
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!.slice(0, 3)}`;
}

function SignedMoney({ value }: { value: bigint }) {
  const colour = value < 0n ? colours.danger : value > 0n ? colours.incomeInk : colours.muted;
  return (
    <Text style={{ color: colour, fontWeight: "600" }}>
      {value < 0n ? "−" : value > 0n ? "+" : ""}
      <Money value={value < 0n ? -value : value} style={{ color: colour, fontWeight: "600" }} />
    </Text>
  );
}

type Names = {
  categories: ReturnType<typeof useLists>["categories"];
  payees: ReturnType<typeof useLists>["payees"];
  accounts: ReturnType<typeof useMoney>["accounts"];
};

function TxRow({ tx, names }: { tx: TransactionView; names: Names }) {
  const index = indexCategories(names.categories);
  const account = (id: string | null) => names.accounts.find((a) => a.id === id)?.name ?? "";
  const payee = names.payees.find((p) => p.id === tx.payeeId)?.name;
  const title =
    tx.kind === "transfer"
      ? `${account(tx.accountId)} → ${account(tx.toAccountId)}`
      : tx.lines.length > 0
        ? `Split (${tx.lines.length})`
        : tx.categoryId
          ? (categoryPath(tx.categoryId, index).split(" › ").pop() ?? "")
          : tx.kind === "expense" || tx.kind === "income"
            ? "Uncategorised"
            : TRANSACTION_KIND_TEXT[tx.kind];
  const sub = [payee, tx.kind === "transfer" ? "Transfer" : account(tx.accountId)].filter(Boolean).join(" · ");
  const isIn = tx.flow === "in";
  const isTransfer = tx.kind === "transfer";
  const tint = isTransfer ? { bg: "#EEEDFE", ink: colours.action } : isIn ? { bg: "#E1F5EE", ink: colours.incomeInk } : { bg: "#F1EFE8", ink: colours.expense };
  const marks = [!tx.confirmed && "To confirm", tx.status === "void" && "Void"].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the transaction"
      onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: tx.id } })}
      style={{ backgroundColor: colours.card, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: tint.bg, alignItems: "center", justifyContent: "center" }}>
        <SymbolView
          name={isTransfer ? { ios: "arrow.left.arrow.right", android: "swap_horiz" } : isIn ? { ios: "arrow.down.left", android: "south_west" } : { ios: "arrow.up.right", android: "north_east" }}
          size={20}
          tintColor={tint.ink}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "600", color: colours.text, textDecorationLine: tx.status === "void" ? "line-through" : "none" }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ color: colours.muted, fontSize: 12 }} numberOfLines={1}>
          {[sub, marks].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Text style={{ fontWeight: "700", color: isTransfer ? colours.text : isIn ? colours.incomeInk : colours.text }}>
        {isTransfer ? "" : isIn ? "+" : "−"}
        <Money value={tx.amountMinor} style={{ fontWeight: "700", color: isTransfer ? colours.text : isIn ? colours.incomeInk : colours.text }} />
      </Text>
    </Pressable>
  );
}
