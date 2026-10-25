/**
 * Date formatting and financial-year helpers (constitution XII).
 *
 * - Calendar dates (e.g. a transaction's date) are `YYYY-MM-DD` strings and are never shifted
 *   by timezone.
 * - Instants (timestamps) are stored in UTC and rendered in the user's timezone.
 */

export type DateFormat = "dd-MMM-yyyy" | "dd/MM/yyyy" | "yyyy-MM-dd";

export const DATE_FORMATS: readonly DateFormat[] = ["dd-MMM-yyyy", "dd/MM/yyyy", "yyyy-MM-dd"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface CalendarDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses and validates a `YYYY-MM-DD` calendar date. */
export function parseCalendarDate(value: string): CalendarDate {
  const m = ISO_DATE.exec(value);
  if (!m) throw new Error(`Invalid calendar date: ${value}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return { year, month, day };
}

function render(d: CalendarDate, format: DateFormat): string {
  const dd = String(d.day).padStart(2, "0");
  const mm = String(d.month).padStart(2, "0");
  const yyyy = String(d.year).padStart(4, "0");
  switch (format) {
    case "dd-MMM-yyyy":
      return `${dd}-${MONTHS[d.month - 1]}-${yyyy}`;
    case "dd/MM/yyyy":
      return `${dd}/${mm}/${yyyy}`;
    case "yyyy-MM-dd":
      return `${yyyy}-${mm}-${dd}`;
  }
}

/** Formats a calendar date (`YYYY-MM-DD`) without any timezone conversion. */
export function formatDate(value: string, prefs: { dateFormat: DateFormat }): string {
  return render(parseCalendarDate(value), prefs.dateFormat);
}

/** The calendar date of a UTC instant as seen in `timezone`. */
export function calendarDateInZone(instant: string | Date, timezone: string): CalendarDate {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid timestamp: ${String(instant)}`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Today's calendar date (`YYYY-MM-DD`) in `timezone` — e.g. the default opening-balance date (FR-004). */
export function todayInZone(timezone: string, now: Date = new Date()): string {
  const d = calendarDateInZone(now, timezone);
  return `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** Formats a UTC instant as a date in the user's timezone. */
export function formatTimestamp(
  instant: string | Date,
  prefs: { dateFormat: DateFormat; timezone: string },
): string {
  return render(calendarDateInZone(instant, prefs.timezone), prefs.dateFormat);
}

export interface FiscalYear {
  startYear: number;
  endYear: number;
  label: string;
}

/** Financial year containing `date` for a year starting in `startMonth` (4 = April). */
export function fiscalYearOf(date: string, startMonth: number): FiscalYear {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new Error(`Invalid financial-year start month: ${startMonth}`);
  }
  const d = parseCalendarDate(date);
  const startYear = d.month >= startMonth ? d.year : d.year - 1;
  if (startMonth === 1) return { startYear, endYear: startYear, label: `FY ${startYear}` };
  const endYear = startYear + 1;
  return { startYear, endYear, label: `FY ${startYear}-${String(endYear % 100).padStart(2, "0")}` };
}

/** True when `timezone` is an IANA timezone the runtime understands. */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
