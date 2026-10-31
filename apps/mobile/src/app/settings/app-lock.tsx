import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { useAppLock } from "@/components/providers/AppLockProvider";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/api";
import { biometricsAvailable, disableBiometrics, enableBiometrics } from "@/lib/app-lock/biometrics";
import { clearPin, isValidPin, setPin, verifyPin } from "@/lib/app-lock/pin";
import { LOCK_TIMEOUTS, MAX_PIN_ATTEMPTS, saveSettings, type LockTimeout } from "@/lib/app-lock/settings-store";

const TIMEOUT_LABEL: Record<LockTimeout, string> = { 0: "Immediately", 60: "After 1 minute", 300: "After 5 minutes", 900: "After 15 minutes" };
const input = { borderWidth: 1, borderColor: "#d0d7de", borderRadius: 8, padding: 10, fontSize: 20, letterSpacing: 6 } as const;

/** Records app lock turned on/off in the user's history (FR-037); best effort when offline. */
function audit(action: "app_lock_enabled" | "app_lock_disabled") {
  void api("/api/me/audit", { body: { action, device: "android" } }).catch(() => undefined);
}

/**
 * App-lock settings (R1 T112; FR-026 – FR-028): turn on with a 4–6 digit PIN entered twice, choose
 * when to lock, optionally unlock with fingerprint; turning it off needs the PIN.
 */
export default function AppLockSettingsScreen() {
  const { settings, reload } = useAppLock();
  const [pin, setPinText] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [canFingerprint, setCanFingerprint] = useState(false);

  useEffect(() => {
    void biometricsAvailable().then(setCanFingerprint).catch(() => setCanFingerprint(false));
  }, []);

  if (!settings) return <Screen title="App lock" />;

  async function turnOn() {
    if (!isValidPin(pin)) return setError("Choose a PIN of 4 to 6 digits.");
    if (pin !== confirm) return setError("The two PINs don't match.");
    await setPin(pin);
    await saveSettings({ ...settings!, enabled: true, failedAttempts: 0 });
    await reload();
    audit("app_lock_enabled");
    setPinText("");
    setConfirm("");
    setError(null);
  }

  async function finishTurnOff() {
    await clearPin();
    await disableBiometrics();
    await saveSettings({ ...settings!, enabled: false, biometrics: false, biometricsSuspended: false, failedAttempts: 0 });
    await reload();
    audit("app_lock_disabled");
    router.back();
  }

  async function setFingerprint(on: boolean) {
    if (on) {
      if (!(await enableBiometrics())) return setError("Fingerprint could not be turned on.");
    } else {
      await disableBiometrics();
    }
    await saveSettings({ ...settings!, biometrics: on, biometricsSuspended: false });
    await reload();
  }

  async function setTimeoutSec(timeoutSec: LockTimeout) {
    await saveSettings({ ...settings!, timeoutSec });
    await reload();
  }

  return (
    <Screen title="App lock">
      <Text style={{ color: "#57606a" }}>
        App lock hides the app behind a PIN (and optionally your fingerprint) when you open it or come back to it. After{" "}
        {MAX_PIN_ATTEMPTS} wrong PINs in a row you are signed out on this phone and the data stored on it is removed — except
        changes not yet sent, which stay sealed and are sent after you sign in again.
      </Text>
      {error && <Text accessibilityRole="alert" style={{ color: "#cf222e" }}>{error}</Text>}

      {!settings.enabled ? (
        <View style={{ gap: 10 }}>
          <Text style={{ fontWeight: "600" }}>Choose a PIN (4–6 digits)</Text>
          <TextInput accessibilityLabel="New PIN" value={pin} onChangeText={(t) => setPinText(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry style={input} />
          <Text style={{ fontWeight: "600" }}>Enter it again</Text>
          <TextInput accessibilityLabel="Confirm PIN" value={confirm} onChangeText={(t) => setConfirm(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry style={input} />
          <Button label="Turn on app lock" onPress={() => void turnOn()} />
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <Text style={{ fontWeight: "600" }}>Lock</Text>
          <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
            {LOCK_TIMEOUTS.map((t) => (
              <Pressable
                key={t}
                accessibilityRole="radio"
                accessibilityState={{ checked: settings.timeoutSec === t }}
                onPress={() => void setTimeoutSec(t)}
                style={{ padding: 10, borderRadius: 8, borderWidth: settings.timeoutSec === t ? 2 : 1, borderColor: settings.timeoutSec === t ? "#1f6feb" : "#d0d7de" }}
              >
                <Text style={{ fontWeight: settings.timeoutSec === t ? "700" : "400" }}>{TIMEOUT_LABEL[t]}</Text>
              </Pressable>
            ))}
          </View>
          {canFingerprint && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text>Unlock with fingerprint</Text>
              <Switch accessibilityLabel="Unlock with fingerprint" value={settings.biometrics && !settings.biometricsSuspended} onValueChange={(on) => void setFingerprint(on)} />
            </View>
          )}
          {settings.biometricsSuspended && <Text>Your fingerprints changed on this phone. Turn fingerprint unlock on again to use it.</Text>}
          <Text style={{ fontWeight: "600" }}>Turn off app lock</Text>
          <TextInput accessibilityLabel="Current PIN" value={pin} onChangeText={(t) => setPinText(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry style={input} />
          <Button
            label="Turn off"
            variant="outline"
            onPress={async () => {
              if (!(await verifyPin(pin))) return setError("Wrong PIN.");
              await finishTurnOff();
            }}
          />
        </View>
      )}
    </Screen>
  );
}
