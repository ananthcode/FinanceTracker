import { ArrowLeftRight, CalendarClock, HandCoins, Landmark, LayoutDashboard, Settings, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Navigation entries (FR-034, contracts/client-shell.md). Later modules replace the placeholders. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/people", label: "People", icon: HandCoins }, // R3 FR-034
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/payment-plan", label: "Payment plan", icon: CalendarClock },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Owner-admin only (FR-034, FR-018); never rendered for members. */
export const ADMIN_ITEM: NavItem = { href: "/admin", label: "User management", icon: Users };

/** "/" matches only itself; other entries also match their sub-pages. */
export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
