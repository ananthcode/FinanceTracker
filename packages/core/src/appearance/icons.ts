/**
 * The built-in icon set (R2-10, R3-09). Stored as keys; each app maps a key to its own rendering
 * (web: lucide-react, Android: Material Symbols). Accounts offer the first 24; categories offer all.
 * The database accepts exactly these keys.
 */
export const ACCOUNT_ICON_KEYS = [
  "bank",
  "building",
  "piggy-bank",
  "safe",
  "wallet",
  "banknote",
  "coins",
  "credit-card",
  "smartphone",
  "briefcase",
  "home",
  "car",
  "fuel",
  "shopping-bag",
  "utensils",
  "gift",
  "graduation-cap",
  "heart",
  "plane",
  "receipt",
  "users",
  "baby",
  "star",
  "globe",
] as const;

const CATEGORY_ONLY_ICON_KEYS = [
  "shopping-cart",
  "zap",
  "droplet",
  "flame",
  "wifi",
  "tv",
  "bus",
  "wrench",
  "stethoscope",
  "pill",
  "book",
  "shirt",
  "laptop",
  "sparkles",
  "party-popper",
  "hand-heart",
  "paw-print",
  "film",
  "ticket",
  "bed",
  "shield",
  "scale",
  "percent",
  "package",
] as const;

export const APPEARANCE_ICON_KEYS = [...ACCOUNT_ICON_KEYS, ...CATEGORY_ONLY_ICON_KEYS] as const;

export type AccountIcon = (typeof ACCOUNT_ICON_KEYS)[number];
export type AppearanceIcon = (typeof APPEARANCE_ICON_KEYS)[number];
