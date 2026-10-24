import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import {
  checkPassword,
  PASSWORD_PROBLEM_MESSAGES,
  type InvitationLookup,
  type SessionResponse,
} from "@ft/core";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { Screen } from "@/components/Screen";
import { api, ApiCallError } from "@/lib/api";
import { GOOGLE_MESSAGES, signInWithGoogle } from "@/lib/oauth";
import { supabase } from "@/lib/supabase";

const inputStyle = { borderWidth: 1, borderColor: "#d0d7de", borderRadius: 8, padding: 10 } as const;

/** Accept an invitation in the Android app (US1, FR-004a). Opened from App Links or in-app. */
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [lookup, setLookup] = useState<InvitationLookup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<InvitationLookup>(`/api/invitations/${token}`, { auth: false })
      .then(setLookup)
      .catch((e: unknown) =>
        setLoadError(
          e instanceof ApiCallError && e.code === "INVITE_NOT_FOUND"
            ? "This invitation link isn't valid. Ask the owner for a new one."
            : e instanceof ApiCallError
              ? e.message
              : "Couldn't load the invitation.",
        ),
      );
  }, [token]);

  const check = password ? checkPassword(password, email) : null;
  const hint = check && !check.ok ? PASSWORD_PROBLEM_MESSAGES[check.reason] : null;

  async function join() {
    setError(null);
    setBusy(true);
    try {
      const session = await api<SessionResponse>(`/api/invitations/${token}/accept`, {
        auth: false,
        body: { email, password, keepSignedIn: true, device: "android", privacyNoticeShown: true },
      });
      // The session provider notices the new session and the gate moves on to setup.
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

  if (loadError) {
    return (
      <Screen title="Invitation">
        <Text>{loadError}</Text>
      </Screen>
    );
  }
  if (!lookup) {
    return (
      <Screen title="Invitation">
        <ActivityIndicator accessibilityLabel="Loading invitation" />
      </Screen>
    );
  }
  if (lookup.status !== "pending") {
    const message =
      lookup.status === "accepted"
        ? "This invitation has already been used. Sign in to continue."
        : `This invitation has ${lookup.status === "expired" ? "expired" : "been withdrawn"}. Ask the owner for a new one.`;
    return (
      <Screen title="Invitation">
        <Text>{message}</Text>
      </Screen>
    );
  }

  return (
    <Screen title="Join Finance Tracker">
      <Text>
        This invitation is for <Text style={{ fontWeight: "600" }}>{lookup.emailMasked}</Text>.
      </Text>
      <PrivacyNotice />
      <View style={{ gap: 6 }}>
        <Text nativeID="email-label">Your email</Text>
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
        <Text nativeID="password-label">Choose a password</Text>
        <TextInput
          accessibilityLabelledBy="password-label"
          secureTextEntry
          autoComplete="new-password"
          value={password}
          onChangeText={setPassword}
          style={inputStyle}
        />
        <Text accessibilityLiveRegion="polite" style={{ color: "#6e7781" }}>
          {hint ?? "At least 8 characters; avoid common passwords."}
        </Text>
      </View>
      {error && (
        <Text accessibilityRole="alert" style={{ color: "#cf222e" }}>
          {error}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy || !email || (check !== null && !check.ok)}
        onPress={join}
        style={{ backgroundColor: "#1f6feb", padding: 12, borderRadius: 8, opacity: busy ? 0.6 : 1 }}
      >
        <Text style={{ color: "white", textAlign: "center", fontWeight: "600" }}>
          {busy ? "Joining…" : "Join with email"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={google}
        style={{ borderWidth: 1, borderColor: "#d0d7de", padding: 12, borderRadius: 8 }}
      >
        <Text style={{ textAlign: "center" }}>Continue with Google</Text>
      </Pressable>
      <Text style={{ color: "#6e7781" }}>
        {"You'll stay signed in on this phone. Turn on app lock in Settings to protect it."}
      </Text>
    </Screen>
  );
}
