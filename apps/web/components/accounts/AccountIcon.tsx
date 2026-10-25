import {
  Baby,
  Banknote,
  Briefcase,
  Building2,
  Car,
  Coins,
  CreditCard,
  Fuel,
  Gift,
  Globe,
  GraduationCap,
  Heart,
  House,
  Landmark,
  PiggyBank,
  Plane,
  Receipt,
  ShoppingBag,
  Smartphone,
  Star,
  Users,
  Utensils,
  Vault,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { ACCOUNT_COLOURS, type AccountColour, type AccountIcon as IconKey } from "@ft/core";

/** Icon keys (packages/core appearance) → lucide icons on the web (research R2-10). */
export const ICONS: Record<IconKey, LucideIcon> = {
  bank: Landmark,
  building: Building2,
  "piggy-bank": PiggyBank,
  safe: Vault,
  wallet: Wallet,
  banknote: Banknote,
  coins: Coins,
  "credit-card": CreditCard,
  smartphone: Smartphone,
  briefcase: Briefcase,
  home: House,
  car: Car,
  fuel: Fuel,
  "shopping-bag": ShoppingBag,
  utensils: Utensils,
  gift: Gift,
  "graduation-cap": GraduationCap,
  heart: Heart,
  plane: Plane,
  receipt: Receipt,
  users: Users,
  baby: Baby,
  star: Star,
  globe: Globe,
};

/** A coloured badge with the account's icon. Decorative: the name and type carry the meaning. */
export function AccountIcon({ icon, colour, size = "md" }: { icon: string; colour: string; size?: "sm" | "md" }) {
  const Icon = ICONS[icon as IconKey] ?? Landmark;
  const hex = (ACCOUNT_COLOURS[colour as AccountColour] ?? ACCOUNT_COLOURS.slate).light;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white ${size === "sm" ? "size-7" : "size-9"}`}
      style={{ backgroundColor: hex }}
    >
      <Icon className={size === "sm" ? "size-4" : "size-5"} />
    </span>
  );
}
