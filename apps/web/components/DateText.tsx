"use client";

import { formatDate, formatTimestamp, type DateFormat } from "@ft/core";
import { useDisplay } from "@/components/providers/DisplayProvider";

/**
 * The ONLY way the web app renders a date (lint rule T011).
 * `date` = calendar date (YYYY-MM-DD, never shifted); `instant` = UTC timestamp shown in the
 * user's timezone (constitution XII).
 */
export function DateText(props: { date: string; className?: string } | { instant: string; className?: string }) {
  const { preferences } = useDisplay();
  const prefs = { dateFormat: preferences.dateFormat as DateFormat, timezone: preferences.timezone };
  const text = "date" in props ? formatDate(props.date, prefs) : formatTimestamp(props.instant, prefs);
  return <time className={props.className}>{text}</time>;
}
