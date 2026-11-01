import { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Muted } from "@/components/ui";
import { colours } from "@/lib/theme";
import { DEFAULT_REMINDERS, hourLabel, loadReminderSettings, REMINDER_HOURS, saveReminderSettings, type ReminderSettings } from "@/lib/reminders";

/** Settings → Reminders (R4 T054): "To confirm" reminders on this phone — on or off, and at what time. */
export default function RemindersScreen() {
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  useEffect(() => {
    let live = true;
    loadReminderSettings().then((s) => live && setSettings(s));
    return () => {
      live = false;
    };
  }, []);
  const change = (next: ReminderSettings) => {
    setSettings(next);
    void saveReminderSettings(next);
  };

  return (
    <Screen title="Reminders">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colours.card, borderRadius: 14, padding: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "600", color: colours.text }}>Remind me about entries to confirm</Text>
          <Muted>On the date of each future-dated entry. Reminders never show amounts or names.</Muted>
        </View>
        <Switch accessibilityLabel="Remind me about entries to confirm" value={settings.enabled} onValueChange={(enabled) => change({ ...settings, enabled })} />
      </View>
      {settings.enabled && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colours.muted }}>Time</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Reminder time" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {REMINDER_HOURS.map((h) => {
              const on = h === settings.hour;
              return (
                <Pressable
                  key={h}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => change({ ...settings, hour: h })}
                  style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 18, backgroundColor: on ? colours.action : colours.card, borderWidth: on ? 0 : 1, borderColor: colours.line }}
                >
                  <Text style={{ color: on ? "#FFFFFF" : colours.text, fontWeight: "600" }}>{hourLabel(h)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Muted>This setting is kept on this phone only.</Muted>
        </View>
      )}
    </Screen>
  );
}
