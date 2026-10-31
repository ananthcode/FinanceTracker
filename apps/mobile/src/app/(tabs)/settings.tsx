import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { DEFAULT_PREFERENCES } from "@ft/core";
import { Button } from "@/components/Button";
import { DateText } from "@/components/DateText";
import { PreferencesForm } from "@/components/PreferencesForm";
import { useSession } from "@/components/providers/SessionProvider";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/api";
import { signOutOfThisPhone, type UnsentChoice } from "@/lib/sign-out";

interface ActivityItem {
  occurredAt: string;
  action: "sign_in_succeeded" | "sign_in_failed" | "sign_in_locked" | "signed_out";
  method: "password" | "google" | null;
  deviceType: "web" | "android" | null;
}

const LABELS: Record<ActivityItem["action"], string> = {
  sign_in_succeeded: "Signed in",
  sign_in_failed: "Failed sign-in attempt",
  sign_in_locked: "Sign-in locked for 15 minutes",
  signed_out: "Signed out",
};

function askAboutUnsent(count: number): Promise<UnsentChoice> {
  return new Promise((resolve) =>
    Alert.alert(
      "Unsent changes",
      `${count} change(s) made offline haven't been sent yet.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve("cancel") },
        { text: "Send now", onPress: () => resolve("send") },
        { text: "Sign out anyway (discard)", style: "destructive", onPress: () => resolve("discard") },
      ],
      { cancelable: true, onDismiss: () => resolve("cancel") },
    ),
  );
}

/** Settings: preferences (US3), own sign-in activity (FR-039) and sign-out of this phone (FR-011). */
export default function SettingsScreen() {
  const { me, refreshMe } = useSession();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ items: ActivityItem[] }>("/api/me/sign-in-activity?limit=20")
      .then((r) => setItems(r.items))
      .catch(() => setOffline(true));
  }, []);

  async function signOut() {
    setBusy(true);
    await signOutOfThisPhone(askAboutUnsent);
    setBusy(false);
  }

  return (
    <Screen title="Settings">
      <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "600" }}>
        Preferences
      </Text>
      {me && (
        <PreferencesForm
          mode="settings"
          initial={me.preferences ?? DEFAULT_PREFERENCES}
          initialDisplayName={me.displayName ?? ""}
          onSaved={refreshMe}
        />
      )}
      <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "600" }}>
        Recent sign-in activity
      </Text>
      {offline && <Text>Activity is unavailable offline.</Text>}
      {items?.length === 0 && <Text>No activity yet.</Text>}
      {items?.map((item, i) => (
        <View key={`${item.occurredAt}-${i}`} style={{ borderTopWidth: 1, borderColor: "#E5E4DD", paddingTop: 6 }}>
          <Text>{LABELS[item.action]}</Text>
          <Text style={{ color: "#6e7781" }}>
            <DateText instant={item.occurredAt} /> · {item.method ?? "—"} · {item.deviceType ?? "—"}
          </Text>
        </View>
      ))}
      <Button label="Categories" variant="outline" onPress={() => router.push("/settings/categories")} />
      <Button label="Tags" variant="outline" onPress={() => router.push("/settings/tags")} />
      <Button label="Payees" variant="outline" onPress={() => router.push("/settings/payees")} />
      <Button label="App lock" variant="outline" onPress={() => router.push("/settings/app-lock")} />
      {me?.role === "owner" && <Button label="User management" variant="outline" onPress={() => router.push("/admin")} />}
      <Button label={busy ? "Signing out…" : "Sign out of this phone"} variant="outline" onPress={signOut} disabled={busy} />
    </Screen>
  );
}
