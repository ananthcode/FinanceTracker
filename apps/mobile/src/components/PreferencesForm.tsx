import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { DATE_FORMATS, fiscalYearOf, isValidTimezone, type Preferences } from "@ft/core";
import { Button } from "@/components/Button";
import { DateText } from "@/components/DateText";
import { Money } from "@/components/Money";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { DisplayProvider } from "@/components/providers/DisplayProvider";
import { api, ApiCallError } from "@/lib/api";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COMMON_ZONES = ["Asia/Kolkata", "UTC", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York"];
const SAMPLE_AMOUNT = 123456700n; // ₹12,34,567.00 in paise

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: selected ? "#1f6feb" : "#d0d7de",
        backgroundColor: selected ? "#ddf4ff" : "transparent",
        borderRadius: 16,
        paddingVertical: 6,
        paddingHorizontal: 12,
      }}
    >
      <Text>{label}</Text>
    </Pressable>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={title} style={{ gap: 6 }}>
      <Text style={{ fontWeight: "600" }}>{title}</Text>
      <ScrollView horizontal contentContainerStyle={{ gap: 6 }} showsHorizontalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * Shared first-run setup / settings form for Android (FR-020–FR-024), with a live preview rendered
 * through Money/DateText using the values currently chosen.
 */
export function PreferencesForm({
  mode,
  initial,
  initialDisplayName,
  needsPrivacyNotice = false,
  onSaved,
}: {
  mode: "setup" | "settings";
  initial: Preferences;
  initialDisplayName: string;
  needsPrivacyNotice?: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [prefs, setPrefs] = useState<Preferences>(initial);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [timezoneText, setTimezoneText] = useState(initial.timezone);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [nowIso] = useState(() => new Date().toISOString());

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    setStatus(null);
  };
  const timezoneOk = isValidTimezone(timezoneText);
  const preview = timezoneOk ? { ...prefs, timezone: timezoneText } : prefs;

  async function save() {
    if (!timezoneOk) return;
    setBusy(true);
    setStatus(null);
    const { baseCurrency, ...editable } = { ...prefs, timezone: timezoneText };
    try {
      if (mode === "setup") {
        await api("/api/me/setup", {
          body: { displayName, baseCurrency, ...editable, ...(needsPrivacyNotice ? { privacyNoticeShown: true } : {}) },
        });
      } else {
        await api("/api/me/preferences", { method: "PATCH", body: { displayName, ...editable } });
        setStatus({ ok: true, message: "Saved. Every screen now uses these settings." });
      }
      await onSaved();
    } catch (e) {
      setStatus({ ok: false, message: e instanceof ApiCallError ? e.message : "Couldn't save. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      {mode === "setup" && needsPrivacyNotice && <PrivacyNotice />}

      <View style={{ gap: 6 }}>
        <Text nativeID="name-label" style={{ fontWeight: "600" }}>
          Display name
        </Text>
        <TextInput
          accessibilityLabelledBy="name-label"
          maxLength={50}
          value={displayName}
          onChangeText={setDisplayName}
          style={{ borderWidth: 1, borderColor: "#d0d7de", borderRadius: 8, padding: 10 }}
        />
      </View>

      {mode === "setup" ? (
        <Group title="Base currency (can't be changed later)">
          {CURRENCIES.map((c) => (
            <Choice key={c} label={c} selected={prefs.baseCurrency === c} onPress={() => set("baseCurrency", c)} />
          ))}
        </Group>
      ) : (
        <Text>
          Base currency: <Text style={{ fontWeight: "600" }}>{prefs.baseCurrency}</Text> (can&apos;t be changed after setup)
        </Text>
      )}

      <Group title="Number format">
        <Choice label="Indian (12,34,567)" selected={prefs.numberFormat === "indian"} onPress={() => set("numberFormat", "indian")} />
        <Choice
          label="International (1,234,567)"
          selected={prefs.numberFormat === "international"}
          onPress={() => set("numberFormat", "international")}
        />
      </Group>

      <Group title="Date format">
        {DATE_FORMATS.map((f) => (
          <Choice key={f} label={f} selected={prefs.dateFormat === f} onPress={() => set("dateFormat", f)} />
        ))}
      </Group>

      <Group title="Financial year starts in">
        {MONTHS.map((m, i) => (
          <Choice key={m} label={m} selected={prefs.fyStartMonth === i + 1} onPress={() => set("fyStartMonth", i + 1)} />
        ))}
      </Group>

      <View style={{ gap: 6 }}>
        <Group title="Timezone">
          {COMMON_ZONES.map((z) => (
            <Choice key={z} label={z} selected={timezoneText === z} onPress={() => setTimezoneText(z)} />
          ))}
        </Group>
        <TextInput
          accessibilityLabel="Timezone"
          autoCapitalize="none"
          value={timezoneText}
          onChangeText={setTimezoneText}
          style={{ borderWidth: 1, borderColor: timezoneOk ? "#d0d7de" : "#cf222e", borderRadius: 8, padding: 10 }}
        />
        {!timezoneOk && <Text style={{ color: "#cf222e" }}>Unknown timezone — use a name like Asia/Kolkata.</Text>}
      </View>

      <View accessibilityLabel="Preview" style={{ borderWidth: 1, borderColor: "#d0d7de", borderRadius: 8, padding: 12, gap: 4 }}>
        <Text style={{ fontWeight: "600" }}>Preview</Text>
        <DisplayProvider preferences={preview}>
          <Text>
            Amount: <Money value={SAMPLE_AMOUNT} />
          </Text>
          <Text>
            Today: <DateText instant={nowIso} />
          </Text>
          <Text>Financial year: {fiscalYearOf(nowIso.slice(0, 10), prefs.fyStartMonth).label}</Text>
        </DisplayProvider>
      </View>

      {status && (
        <Text accessibilityRole={status.ok ? "text" : "alert"} style={{ color: status.ok ? "#1a7f37" : "#cf222e" }}>
          {status.message}
        </Text>
      )}
      <Button
        label={busy ? "Saving…" : mode === "setup" ? "Finish setup" : "Save preferences"}
        onPress={save}
        disabled={busy || !displayName.trim() || !timezoneOk}
      />
    </View>
  );
}
