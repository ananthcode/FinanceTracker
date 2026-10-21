import { DEFAULT_PREFERENCES } from "@ft/core";
import { Text } from "react-native";
import { PreferencesForm } from "@/components/PreferencesForm";
import { useSession } from "@/components/providers/SessionProvider";
import { Screen } from "@/components/Screen";

/** First-run setup on Android (US3, FR-020). The gate moves on once setup completes. */
export default function SetupScreen() {
  const { me, refreshMe } = useSession();
  return (
    <Screen title="Set up your account">
      <Text>These choices decide how amounts and dates appear everywhere.</Text>
      <PreferencesForm
        mode="setup"
        initial={me?.preferences ?? DEFAULT_PREFERENCES}
        initialDisplayName={me?.displayName ?? ""}
        needsPrivacyNotice={me ? !me.privacyNoticeShown : false}
        onSaved={refreshMe}
      />
    </Screen>
  );
}
