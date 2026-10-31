import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { unlockWithBiometrics } from "@/lib/app-lock/biometrics";
import type { AppLockController } from "@/lib/app-lock/controller";
import type { AppLockSettings } from "@/lib/app-lock/settings-store";
import { Button } from "./Button";

/**
 * The lock screen (R1 T111): covers every screen until unlocked with fingerprint or PIN; after 5
 * wrong PINs the user is signed out (FR-028); "Forgot PIN" requires a full sign-in (FR-029).
 */
export function LockScreen({
  settings,
  controller,
  onUnlocked,
}: {
  settings: AppLockSettings;
  controller: AppLockController;
  onUnlocked: () => void;
}) {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fingerprint = settings.biometrics && !settings.biometricsSuspended;

  async function tryFingerprint() {
    const result = await unlockWithBiometrics();
    if (result === "unlocked") return onUnlocked();
    if (result === "enrolment-changed") {
      await controller.suspendBiometrics();
      setMessage("Your fingerprints changed on this phone. Enter your PIN, then turn fingerprint unlock on again in Settings.");
    }
  }

  useEffect(() => {
    if (!fingerprint) return;
    const id = setTimeout(() => void tryFingerprint(), 0); // prompt once when the lock appears
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  async function submit() {
    setBusy(true);
    const outcome = await controller.submitPin(pin);
    setBusy(false);
    setPin("");
    if (outcome.ok) return onUnlocked();
    if ("signedOut" in outcome) return; // the auth gate shows sign-in
    setMessage(
      outcome.remaining === 1
        ? "Wrong PIN. 1 try left — after that you will be signed out on this phone."
        : `Wrong PIN. ${outcome.remaining} tries left.`,
    );
  }

  function forgot() {
    Alert.alert("Forgot your PIN?", "You will be signed out on this phone. Sign in again to set a new PIN. Nothing you saved is lost.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void controller.forgotPin() },
    ]);
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "white" }]} accessibilityViewIsModal importantForAccessibility="yes">
      <SafeAreaView style={{ flex: 1, padding: 24, gap: 16, justifyContent: "center" }}>
        <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: "600", textAlign: "center" }}>
          Finance Tracker is locked
        </Text>
        <TextInput
          accessibilityLabel="PIN"
          value={pin}
          onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          autoFocus={!fingerprint}
          onSubmitEditing={() => void submit()}
          style={{ borderWidth: 1, borderColor: "#d0d7de", borderRadius: 8, padding: 12, fontSize: 24, textAlign: "center", letterSpacing: 8 }}
        />
        {message && (
          <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ textAlign: "center" }}>
            {message}
          </Text>
        )}
        <Button label="Unlock" onPress={() => void submit()} disabled={busy || pin.length < 4} />
        {fingerprint && <Button label="Use fingerprint" variant="outline" onPress={() => void tryFingerprint()} />}
        <Pressable accessibilityRole="button" onPress={forgot} hitSlop={8}>
          <Text style={{ color: "#1f6feb", fontWeight: "600", textAlign: "center" }}>Forgot PIN</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
