import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import type { TransactionView } from "@ft/core";

/**
 * "To confirm" reminders on the phone (R4 T054, owner decision 2026-11-01: local, not push).
 * One reminder at the chosen hour (default 8 am; Settings → Reminders, per phone) on each date that has future-dated entries waiting; the phone schedules
 * them itself, so they work offline. The text never names amounts or payees (lock screen privacy).
 */
export const REMINDER_HOURS = [6, 7, 8, 9, 10, 12, 18, 20, 21] as const;
const KIND = "to-confirm";
const SETTINGS_KEY = "ft.reminders";

export interface ReminderSettings {
  enabled: boolean;
  /** Hour of the day, 0–23, in the phone's time zone. */
  hour: number;
}

export const DEFAULT_REMINDERS: ReminderSettings = { enabled: true, hour: 8 };

export async function loadReminderSettings(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ReminderSettings>) : {};
    const hour = typeof parsed.hour === "number" && parsed.hour >= 0 && parsed.hour <= 23 ? parsed.hour : DEFAULT_REMINDERS.hour;
    return { enabled: parsed.enabled !== false, hour };
  } catch {
    return DEFAULT_REMINDERS;
  }
}

/** Saves the setting and re-plans at once (the last plan is kept for that). */
export async function saveReminderSettings(settings: ReminderSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  lastKey = "";
  if (lastPlan) await scheduleReminders(lastPlan);
}

export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? "am" : "pm"}`;
}

export interface ReminderPlan {
  /** `yyyy-MM-dd` */
  date: string;
  count: number;
}

/** The reminders to schedule: one per future date with unconfirmed entries, soonest first. */
export function planReminders(transactions: readonly TransactionView[], today: string): ReminderPlan[] {
  const byDate = new Map<string, number>();
  for (const t of transactions) {
    if (t.state === "active" && !t.confirmed && t.date > today) byDate.set(t.date, (byDate.get(t.date) ?? 0) + 1);
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
}

export function reminderText(count: number): { title: string; body: string } {
  return {
    title: count === 1 ? "1 entry to confirm" : `${count} entries to confirm`,
    body: "Upcoming entries are due today. Open Finance Tracker to confirm them.",
  };
}

let lastKey = "";
let lastPlan: ReminderPlan[] | null = null;

/** Replaces this app's scheduled reminders with the plan. Asks for permission only when there is something to remind. */
export async function scheduleReminders(plan: ReminderPlan[]): Promise<void> {
  lastPlan = plan;
  const settings = await loadReminderSettings();
  const key = JSON.stringify([settings, plan]);
  if (key === lastKey) return;
  lastKey = key;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((n) => n.content.data?.kind === KIND).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  if (plan.length === 0 || !settings.enabled) return;
  const permission = await Notifications.getPermissionsAsync();
  const granted = permission.granted || (permission.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return;
  // Android allows a limited number of pending alarms; the next 30 dates are plenty.
  for (const { date, count } of plan.slice(0, 30)) {
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    await Notifications.scheduleNotificationAsync({
      content: { ...reminderText(count), data: { kind: KIND, date } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(y, m - 1, d, settings.hour, 0, 0) },
    });
  }
}
