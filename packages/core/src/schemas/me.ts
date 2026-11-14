import { z } from "zod";
import { isValidTimezone } from "../dates";
import {
  CurrencyCode,
  DateFormatSchema,
  Device,
  DisplayName,
  Environment,
  NumberFormatSchema,
} from "./common";

export const Timezone = z.string().min(1).max(64).refine(isValidTimezone, "Unknown timezone");
export const FyStartMonth = z.number().int().min(1).max(12);
/** Accounts screen view (R2 FR-009). */
export const AccountsViewSchema = z.enum(["by_type", "my_groups"]);
export const CategoriesStartSchema = z.enum(["suggested", "empty"]);
/** 0 … 999,999,999,999 paise. */
export const BufferMinor = z.string().regex(/^\d{1,12}$/, "Use a whole number of paise from 0");
/** `yyyy-MM-01` (R7 FR-023). */
export const PlanCheckedMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, "Use the 1st of a month");

/** Warranty reminder days (R9-06, clarify Q3). */
export const WARRANTY_FIRST_CHOICES = [15, 30, 60, 90] as const;
export const WARRANTY_SECOND_CHOICES = [15, 30, 60] as const;
export const WarrantyFirstDays = z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(90)]);
export const WarrantySecondDays = z.union([z.literal(15), z.literal(30), z.literal(60)]).nullable();

export const Preferences = z.object({
  baseCurrency: CurrencyCode,
  numberFormat: NumberFormatSchema,
  dateFormat: DateFormatSchema,
  fyStartMonth: FyStartMonth,
  timezone: Timezone,
  /** Defaults so R1 setup and older clients need not send it (R2 FR-009). */
  accountsView: AccountsViewSchema.default("by_type"),
  /** The one-time default-categories choice (R3 FR-007); set only by app.start_categories. */
  categoriesStart: CategoriesStartSchema.nullable().default(null),
  /** Kept back from what is safe to spend (R6 FR-002, FR-003); paise as a decimal string. */
  bufferMinor: BufferMinor.default("0"),
  /** "Remind me to check next month's plan" (R7 FR-023). */
  planNudge: z.boolean().default(true),
  /** The latest month marked "Plan checked" (`yyyy-MM-01`); it and earlier months count as checked. */
  planCheckedMonth: PlanCheckedMonth.nullable().default(null),
  /** The first warranty reminder, days before expiry (R9-06). */
  warrantyFirstDays: WarrantyFirstDays.default(60),
  /** The second, closer to expiry than the first; null = off. */
  warrantySecondDays: WarrantySecondDays.default(30),
});
export type Preferences = z.infer<typeof Preferences>;

export const DEFAULT_PREFERENCES: Preferences = {
  baseCurrency: "INR",
  numberFormat: "indian",
  dateFormat: "dd-MMM-yyyy",
  fyStartMonth: 4,
  timezone: "Asia/Kolkata",
  accountsView: "by_type",
  categoriesStart: null,
  bufferMinor: "0",
  planNudge: true,
  planCheckedMonth: null,
  warrantyFirstDays: 60,
  warrantySecondDays: 30,
};

export const SetupRequest = Preferences.omit({ categoriesStart: true, warrantyFirstDays: true, warrantySecondDays: true }).extend({
  displayName: DisplayName,
  /** Required when the profile has no record yet (Google join path) — FR-036e. */
  privacyNoticeShown: z.boolean().optional(),
});
export type SetupRequest = z.infer<typeof SetupRequest>;

/** baseCurrency is deliberately absent: it is locked after setup (FR-021). */
export const PreferencesUpdate = z
  .object({
    displayName: DisplayName,
    numberFormat: NumberFormatSchema,
    dateFormat: DateFormatSchema,
    fyStartMonth: FyStartMonth,
    timezone: Timezone,
    accountsView: AccountsViewSchema,
    bufferMinor: BufferMinor,
    planNudge: z.boolean(),
    /** The server keeps the later of the stored and the sent month (research R7-09). */
    planCheckedMonth: PlanCheckedMonth,
    warrantyFirstDays: WarrantyFirstDays,
    warrantySecondDays: WarrantySecondDays,
  })
  .partial()
  .strict()
  // The two reminder days are set together, the second closer to expiry (R9-06).
  .refine((p) => ("warrantyFirstDays" in p) === ("warrantySecondDays" in p), {
    message: "Set both warranty reminders",
    path: ["warrantySecondDays"],
  })
  .refine((p) => p.warrantySecondDays == null || p.warrantyFirstDays === undefined || p.warrantySecondDays < p.warrantyFirstDays, {
    message: "The second reminder must be closer to expiry than the first",
    path: ["warrantySecondDays"],
  });
export type PreferencesUpdate = z.infer<typeof PreferencesUpdate>;

export const MeResponse = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
  role: z.enum(["owner", "member"]),
  setupComplete: z.boolean(),
  /** False only on the Google joining path until setup records it (FR-036e). */
  privacyNoticeShown: z.boolean(),
  preferences: Preferences,
  environment: Environment,
});
export type MeResponse = z.infer<typeof MeResponse>;

export const DeviceAuditRequest = z.object({
  action: z.enum(["app_lock_enabled", "app_lock_disabled"]),
  device: Device,
});
