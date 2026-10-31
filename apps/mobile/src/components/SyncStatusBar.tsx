import { Pressable, Text, View } from "react-native";
import { useSync } from "@/components/providers/SyncProvider";

const NOTICE_TEXT = {
  renamed: (n: { renamedTo?: string }) => `Saved as "${n.renamedTo}" because the name was already used on another device.`,
  converted: () => "A delete was turned into an archive because the account has transactions.",
  rejected: (n: { code?: string }) =>
    n.code === "BALANCE_NOT_ZERO"
      ? "An archive was not applied: the balance is not ₹0.00."
      : n.code === "NOT_FOUND"
        ? "A change was not applied: the item was removed on another device."
        : "A change was not applied. The latest version is shown.",
};

/**
 * "N changes waiting to be sent" (R2 FR-033) and what the server did with them (FR-032, FR-034).
 * Words, not colour alone (Principle XIII).
 */
export function SyncStatusBar() {
  const { pending, syncing, lastError, notices, dismissNotices, syncNow } = useSync();
  if (pending === 0 && notices.length === 0 && !syncing) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: 8, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#E5E4DD" }}>
      {pending > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={{ flex: 1 }}>
            {pending === 1 ? "1 change waiting to be sent" : `${pending} changes waiting to be sent`}
            {syncing ? " — sending…" : lastError ? " — will retry when online" : ""}
          </Text>
          {!syncing && (
            <Pressable accessibilityRole="button" onPress={() => void syncNow()} hitSlop={8}>
              <Text style={{ color: "#534AB7", fontWeight: "600" }}>Send now</Text>
            </Pressable>
          )}
        </View>
      )}
      {notices.map((n) => (
        <Text key={n.changeId}>{NOTICE_TEXT[n.status](n)}</Text>
      ))}
      {notices.length > 0 && (
        <Pressable accessibilityRole="button" onPress={() => void dismissNotices()} hitSlop={8}>
          <Text style={{ color: "#534AB7", fontWeight: "600" }}>Dismiss</Text>
        </Pressable>
      )}
    </View>
  );
}
