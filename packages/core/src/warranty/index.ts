/**
 * Warranties (R9-05, R9-06; clarify Q3): days left, the reminder due, time left in words, and the order
 * of the Warranties list. "Today" is the user's calendar date in their timezone.
 */

export interface WarrantyPrefs {
  /** 15, 30, 60 or 90 days before expiry. */
  warrantyFirstDays: number;
  /** 15, 30 or 60, below the first; null = off. */
  warrantySecondDays: number | null;
}

const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/** Whole days from today to the expiry: 0 on the last day, negative once expired. */
export function warrantyDaysLeft(today: string, until: string): number {
  return Math.round(dayNumber(until) - dayNumber(today));
}

/**
 * The reminder due today: 2 from the second reminder day (unless dismissed), else 1 from the first (unless
 * dismissed), else null. Nothing after expiry: expired warranties are listed under Warranties › Expired.
 */
export function warrantyReminder(today: string, until: string | null, dismissed: number, prefs: WarrantyPrefs): 1 | 2 | null {
  if (until === null) return null;
  const days = warrantyDaysLeft(today, until);
  if (days < 0) return null;
  if (prefs.warrantySecondDays !== null && days <= prefs.warrantySecondDays && dismissed < 2) return 2;
  if (days <= prefs.warrantyFirstDays && dismissed < 1) return 1;
  return null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Whole months from `from` to `to` (to ≥ from). */
function monthsBetween(from: string, to: string): number {
  let months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));
  if (Number(to.slice(8, 10)) < Number(from.slice(8, 10))) months -= 1;
  return months;
}

/** "3 months left", "2 years left", "expires in 12 days", "expires today", "expired 4 days ago". */
export function warrantyTimeLeft(today: string, until: string): string {
  const days = warrantyDaysLeft(today, until);
  if (days < 0) return `expired ${plural(-days, "day")} ago`;
  if (days === 0) return "expires today";
  if (days <= 60) return `expires in ${plural(days, "day")}`;
  const months = monthsBetween(today, until);
  if (months < 24) return `${plural(months, "month")} left`;
  return `${plural(Math.floor(months / 12), "year")} left`;
}

/** Active warranties soonest first; expired ones most recently expired first. */
export function sortWarranties<T extends { warrantyUntil: string | null; date: string; id: string }>(
  rows: T[],
  today: string,
): { active: T[]; expired: T[] } {
  const withDate = rows.filter((r): r is T & { warrantyUntil: string } => r.warrantyUntil !== null);
  const key = (r: T & { warrantyUntil: string }) => `${r.warrantyUntil}|${r.date}|${r.id}`;
  const active = withDate.filter((r) => r.warrantyUntil >= today).sort((a, b) => key(a).localeCompare(key(b)));
  const expired = withDate.filter((r) => r.warrantyUntil < today).sort((a, b) => key(b).localeCompare(key(a)));
  return { active, expired };
}
