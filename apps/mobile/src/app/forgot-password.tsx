import { Link } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { api, ApiCallError } from "@/lib/api";

/**
 * Request a reset link (FR-008). The link opens the web reset page, which works on any device;
 * the response is always the same neutral message.
 */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    try {
      const res = await api<{ message: string }>("/api/auth/password-reset", { auth: false, body: { email } });
      setMessage(res.message);
    } catch (e) {
      setMessage(e instanceof ApiCallError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Reset your password">
      <View style={{ gap: 6 }}>
        <Text nativeID="email-label">Email</Text>
        <TextInput
          accessibilityLabelledBy="email-label"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={{ borderWidth: 1, borderColor: "#E5E4DD", borderRadius: 8, padding: 10 }}
        />
      </View>
      <Button label={busy ? "Sending…" : "Send reset link"} onPress={submit} disabled={busy || !email} />
      {message && <Text accessibilityLiveRegion="polite">{message}</Text>}
      <Link href="/sign-in" style={{ textDecorationLine: "underline" }}>
        Back to sign in
      </Link>
    </Screen>
  );
}
