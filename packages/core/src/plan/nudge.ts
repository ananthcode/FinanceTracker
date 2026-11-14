/**
 * The month-check nudge (FR-023, clarify Q3–Q4; research R7-09). From the 25th to the end of a month
 * the nudge is about next month; from the 1st to the 5th about this month. It stops only when the
 * user selects "Plan checked" for that month (the preference holds the latest checked month, and
 * earlier months count as checked too), or turns the reminder off. "Not now" is per device.
 */
import { addMonths, monthOf } from "./months";
import type { Month } from "./schemas";

const dayOf = (iso: string) => Number(iso.slice(8, 10));

/** The month the nudge is about today, or null outside the 25th-to-5th window. */
export function nudgeWindowMonth(today: string): Month | null {
  const day = dayOf(today);
  if (day >= 25) return addMonths(monthOf(today), 1);
  if (day <= 5) return monthOf(today);
  return null;
}

/** The month to nudge about today, or null (outside the window, reminder off, or already checked). */
export function nudgeFor(today: string, prefs: { planNudge: boolean; planCheckedMonth: Month | null }): Month | null {
  if (!prefs.planNudge) return null;
  const month = nudgeWindowMonth(today);
  if (!month) return null;
  if (prefs.planCheckedMonth !== null && prefs.planCheckedMonth >= month) return null;
  return month;
}

/**
 * The one month "Plan checked" is offered for: this month from the 1st to the 5th, otherwise next
 * month. So checking can never skip over an unchecked month.
 */
export function planCheckMonth(today: string): Month {
  return dayOf(today) <= 5 ? monthOf(today) : addMonths(monthOf(today), 1);
}

/** Whether a month counts as checked. */
export const isPlanChecked = (month: Month, planCheckedMonth: Month | null) => planCheckedMonth !== null && planCheckedMonth >= month;

/** "Not now" hides the nudge until the next day on this device: true while `snoozedUntil` is after today. */
export const isNudgeSnoozed = (today: string, snoozedUntil: string | null) => snoozedUntil !== null && /^\d{4}-\d{2}-\d{2}$/.test(snoozedUntil) && snoozedUntil > today;
