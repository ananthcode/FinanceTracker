/**
 * Account colours and icons (FR-008, research R2-10). Stored as keys; each app maps a key to its
 * own rendering (web: lucide-react, Android: Material Symbols). Colour is decoration only — type
 * and labels carry the meaning (Principle XIII). The database accepts exactly these keys.
 */
import type { AccountType } from "./types";

/** 12 colours, each ≥ 3:1 contrast against the light (#ffffff) and dark (#0d1117) card background. */
export const ACCOUNT_COLOURS = {
  blue: { light: "#1f6feb", dark: "#4493f8" },
  teal: { light: "#0f766e", dark: "#2dd4bf" },
  green: { light: "#1a7f37", dark: "#3fb950" },
  olive: { light: "#4d7c0f", dark: "#a3e635" },
  amber: { light: "#9a6700", dark: "#d29922" },
  orange: { light: "#bc4c00", dark: "#f0883e" },
  red: { light: "#cf222e", dark: "#f85149" },
  pink: { light: "#bf3989", dark: "#f778ba" },
  purple: { light: "#8250df", dark: "#a371f7" },
  indigo: { light: "#4f46e5", dark: "#818cf8" },
  slate: { light: "#57606a", dark: "#8b949e" },
  brown: { light: "#8b5a2b", dark: "#c69060" },
} as const;

export type AccountColour = keyof typeof ACCOUNT_COLOURS;
export const ACCOUNT_COLOUR_KEYS = Object.keys(ACCOUNT_COLOURS) as AccountColour[];

// The icon keys live in ../appearance (shared with categories, R3-09); accounts use the first 24.
import type { AccountIcon } from "../appearance/icons";
export { ACCOUNT_ICON_KEYS, type AccountIcon } from "../appearance/icons";

const DEFAULTS: Record<AccountType, { colour: AccountColour; icon: AccountIcon }> = {
  bank: { colour: "blue", icon: "bank" },
  cash: { colour: "green", icon: "banknote" },
  wallet: { colour: "purple", icon: "wallet" },
  credit_card: { colour: "orange", icon: "credit-card" },
};

export function defaultAppearance(type: AccountType): { colour: AccountColour; icon: AccountIcon } {
  return DEFAULTS[type];
}
