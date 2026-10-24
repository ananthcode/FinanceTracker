import { Text, type TextProps } from "react-native";
import { formatDate, formatTimestamp, type DateFormat } from "@ft/core";
import { useDisplay } from "@/components/providers/DisplayProvider";

/**
 * The ONLY way the Android app renders a date (lint rule T011). `date` = calendar date
 * (YYYY-MM-DD, never shifted); `instant` = UTC timestamp shown in the user's timezone.
 */
export function DateText(props: ({ date: string } | { instant: string }) & TextProps) {
  const { preferences } = useDisplay();
  const prefs = { dateFormat: preferences.dateFormat as DateFormat, timezone: preferences.timezone };
  const { date, instant, ...rest } = props as { date?: string; instant?: string } & TextProps;
  const text = date !== undefined ? formatDate(date, prefs) : formatTimestamp(instant ?? "", prefs);
  return <Text {...rest}>{text}</Text>;
}
