import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

/**
 * Right side of every tab header: the owner-only User management entry (FR-034) and the slot for
 * per-device controls such as the hide-balances toggle (US7).
 */
export function HeaderActions({ isOwner, children }: { isOwner: boolean; children?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 }}>
      {children}
      {isOwner && (
        <Pressable
          testID="admin-entry"
          accessibilityRole="button"
          accessibilityLabel="User management"
          hitSlop={8}
          onPress={() => router.push("/admin")}
          style={{ padding: 4 }}
        >
          <SymbolView name={{ ios: "person.2", android: "manage_accounts" }} size={24} tintColor="#1f6feb" />
        </Pressable>
      )}
    </View>
  );
}
