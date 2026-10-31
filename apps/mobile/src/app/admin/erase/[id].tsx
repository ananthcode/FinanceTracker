import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { api, ApiCallError } from "@/lib/api";

/**
 * Two-step erase confirmation on Android (T095, FR-016a): (1) warning of exactly what is erased and
 * that it cannot be undone, then (2) typing the user's email exactly. Nothing is erased until both.
 */
export default function EraseUserScreen() {
  const { id, email } = useLocalSearchParams<{ id: string; email: string }>();
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = !!email && typed.trim().toLowerCase() === email.toLowerCase();

  async function erase() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/users/${id}/erase`, { body: { confirmEmail: typed.trim() } });
      router.back();
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "Couldn't erase this user.");
      setBusy(false);
    }
  }

  return (
    <Screen title={`Erase ${email ?? "user"}?`}>
      {step === 1 ? (
        <>
          <Text>This permanently erases:</Text>
          <View style={{ gap: 2, paddingLeft: 8 }}>
            <Text>• their sign-in access,</Text>
            <Text>• their preferences,</Text>
            <Text>• all of their financial data,</Text>
            <Text>• their name and email from the activity history.</Text>
          </View>
          <Text style={{ fontWeight: "600" }}>This cannot be undone. You will not see any of their data during erasure.</Text>
          <Button label="Continue" onPress={() => setStep(2)} />
          <Button label="Cancel" variant="outline" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <Text nativeID="erase-confirm-label">Type the user&apos;s email to confirm</Text>
            <TextInput
              accessibilityLabelledBy="erase-confirm-label"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={typed}
              onChangeText={setTyped}
              style={{ borderWidth: 1, borderColor: "#E5E4DD", borderRadius: 8, padding: 10 }}
            />
          </View>
          {error && <Text accessibilityLiveRegion="polite">{error}</Text>}
          <Button label={busy ? "Erasing…" : "Erase permanently"} onPress={erase} disabled={!matches || busy} />
          <Button label="Cancel" variant="outline" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
