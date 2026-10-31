import { Link } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import type { SessionResponse } from "@ft/core";
import { Button } from "@/components/Button";
import { useSession } from "@/components/providers/SessionProvider";
import { Screen } from "@/components/Screen";
import { api, ApiCallError } from "@/lib/api";
import { GOOGLE_MESSAGES, signInWithGoogle } from "@/lib/oauth";
import { supabase } from "@/lib/supabase";

const inputStyle = { borderWidth: 1, borderColor: "#E5E4DD", borderRadius: 8, padding: 10 } as const;

/** Android sign-in (US2, FR-006, FR-009, FR-012). */
export default function SignInScreen() {
  const { lastForcedReason } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const session = await api<SessionResponse>("/api/auth/sign-in", {
        auth: false,
        body: { email, password, keepSignedIn: true, device: "android" },
      });
      await supabase().auth.setSession({
        access_token: session.accessToken ?? "",
        refresh_token: session.refreshToken ?? "",
      });
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    const result = await signInWithGoogle();
    if (!result.ok) setError(GOOGLE_MESSAGES[result.reason]);
  }

  return (
    <Screen title="Sign in">
      {lastForcedReason && (
        <Text accessibilityRole="alert">
          {lastForcedReason === "inactive"
            ? "Your access has been disabled. Contact the owner."
            : "You've been signed out. Please sign in again."}
        </Text>
      )}
      <View style={{ gap: 6 }}>
        <Text nativeID="email-label">Email</Text>
        <TextInput
          accessibilityLabelledBy="email-label"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={inputStyle}
        />
      </View>
      <View style={{ gap: 6 }}>
        <Text nativeID="password-label">Password</Text>
        <TextInput
          accessibilityLabelledBy="password-label"
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
          style={inputStyle}
        />
      </View>
      {error && (
        <Text accessibilityRole="alert" style={{ color: "#cf222e" }}>
          {error}
        </Text>
      )}
      <Button label={busy ? "Signing in…" : "Sign in"} onPress={submit} disabled={busy || !email || !password} />
      <Button label="Continue with Google" variant="outline" onPress={google} />
      <Link href="/forgot-password" style={{ textDecorationLine: "underline" }}>
        Forgot your password?
      </Link>
    </Screen>
  );
}
