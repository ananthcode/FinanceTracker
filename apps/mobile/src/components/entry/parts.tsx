import { SymbolView } from "expo-symbols";
import { Pressable, ScrollView, Text, View } from "react-native";
import { categoryPath, indexCategories, type AccountView, type CategoryView } from "@ft/core";
import { Money } from "@/components/Money";
import { OPERATORS, pressKey } from "@/lib/calc";
import { colours } from "@/lib/theme";

/** Building blocks of the add-transaction flow (docs/ANDROID-HOME.md). */

export function AccountChips({
  label,
  accounts,
  value,
  onChange,
  balances,
  tone = colours.action,
}: {
  label: string;
  accounts: AccountView[];
  value: string | null;
  onChange: (id: string) => void;
  balances?: Map<string, bigint>;
  tone?: string;
}) {
  const chosen = accounts.find((a) => a.id === value);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colours.muted, fontSize: 13 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {accounts.map((a) => {
          const on = a.id === value;
          return (
            <Pressable
              key={a.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(a.id)}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20, backgroundColor: on ? tone : colours.card, borderWidth: on ? 0 : 1, borderColor: colours.line }}
            >
              {on && <SymbolView name={{ ios: "checkmark", android: "check" }} size={16} tintColor="#FFFFFF" />}
              <Text style={{ color: on ? "#FFFFFF" : colours.text, fontWeight: "600" }}>{a.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {chosen && balances?.has(chosen.id) && (
        <Text style={{ color: colours.muted, fontSize: 12 }}>
          Balance <Money value={balances.get(chosen.id)!} currency={chosen.currency} style={{ fontSize: 12, color: colours.muted }} />
        </Text>
      )}
    </View>
  );
}

const KEYS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", ".", "0", "back", "+"];

/** Number pad with the calculator built in (+ − × ÷). */
export function AmountPad({ expr, onChange }: { expr: string; onChange: (expr: string) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 }}>
      {KEYS.map((k) => {
        const op = (OPERATORS as readonly string[]).includes(k);
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={k === "back" ? "Delete" : k === "−" ? "minus" : k === "×" ? "times" : k === "÷" ? "divide" : k}
            onPress={() => onChange(pressKey(expr, k))}
            android_ripple={{ color: colours.line, borderless: false }}
            style={{ width: "23%", height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: op ? colours.actionTint : colours.card }}
          >
            {k === "back" ? (
              <SymbolView name={{ ios: "delete.left", android: "backspace" }} size={24} tintColor="#D4537E" />
            ) : (
              <Text style={{ fontSize: 24, fontWeight: "600", color: op ? colours.actionInk : colours.text }}>{k}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Category chips: suggestions first, then every category of the kind; › opens sub-categories. */
export function CategoryChips({
  categories,
  kind,
  suggested,
  query,
  value,
  onPick,
}: {
  categories: CategoryView[];
  kind: "expense" | "income";
  suggested: string[];
  query: string;
  value: string | null;
  onPick: (id: string) => void;
}) {
  const index = indexCategories(categories);
  const visible = categories.filter((c) => c.kind === kind && !c.hidden);
  const q = query.trim().toLowerCase();
  const shown = q === "" ? visible.filter((c) => c.parentId === null || !index.has(c.parentId)) : visible.filter((c) => c.name.toLowerCase().includes(q));
  const chip = (c: CategoryView, emphasise = false) => (
    <Pressable
      key={(emphasise ? "s-" : "") + c.id}
      accessibilityRole="button"
      accessibilityState={{ selected: c.id === value }}
      onPress={() => onPick(c.id)}
      style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, backgroundColor: colours.card, borderWidth: c.id === value || emphasise ? 2 : 1, borderColor: c.id === value ? colours.action : emphasise ? "#D4537E" : colours.line }}
    >
      <Text style={{ color: colours.text, fontWeight: "500" }}>{q === "" ? c.name : categoryPath(c.id, index)}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 12 }}>
      {q === "" && suggested.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colours.muted, fontSize: 13 }}>Suggested</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{suggested.map((id) => index.get(id)).filter((c): c is CategoryView => !!c).map((c) => chip(c, true))}</View>
        </View>
      )}
      <View style={{ gap: 6 }}>
        <Text style={{ color: colours.muted, fontSize: 13 }}>{q === "" ? `All ${kind} categories` : "Matches"}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {shown.map((c) => chip(c))}
          {shown.length === 0 && <Text style={{ color: colours.muted }}>No matching categories.</Text>}
        </View>
        {q === "" && <SubCategories categories={visible} value={value} onPick={onPick} />}
      </View>
    </View>
  );
}

/** Sub-categories of the chosen top category, so a › level is one more tap. */
function SubCategories({ categories, value, onPick }: { categories: CategoryView[]; value: string | null; onPick: (id: string) => void }) {
  const chosen = categories.find((c) => c.id === value);
  const parentId = chosen ? (categories.some((c) => c.parentId === chosen.id) ? chosen.id : chosen.parentId) : null;
  const children = parentId ? categories.filter((c) => c.parentId === parentId) : [];
  if (children.length === 0) return null;
  return (
    <View style={{ gap: 6, marginTop: 6 }}>
      <Text style={{ color: colours.muted, fontSize: 13 }}>Inside {categories.find((c) => c.id === parentId)?.name}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {children.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityState={{ selected: c.id === value }}
            onPress={() => onPick(c.id)}
            style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16, backgroundColor: c.id === value ? colours.actionTint : colours.card, borderWidth: 1, borderColor: c.id === value ? colours.action : colours.line }}
          >
            <Text style={{ color: colours.text }}>{c.name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
