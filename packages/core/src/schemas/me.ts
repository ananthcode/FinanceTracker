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

export const Preferences = z.object({
  baseCurrency: CurrencyCode,
  numberFormat: NumberFormatSchema,
  dateFormat: DateFormatSchema,
  fyStartMonth: FyStartMonth,
  timezone: Timezone,
  /** Defaults so R1 setup and older clients need not send it (R2 FR-009). */
  accountsView: AccountsViewSchema.default("by_type"),
});
export type Preferences = z.infer<typeof Preferences>;

export const DEFAULT_PREFERENCES: Preferences = {
  baseCurrency: "INR",
  numberFormat: "indian",
  dateFormat: "dd-MMM-yyyy",
  fyStartMonth: 4,
  timezone: "Asia/Kolkata",
  accountsView: "by_type",
};

export const SetupRequest = Preferences.extend({
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
  })
  .partial()
  .strict();
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
