"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_ITEM, isActive, NAV_ITEMS } from "./nav-items";

/**
 * The navigation list. The current section is marked with `aria-current="page"` and shown with a
 * bar, bold text and colour — never colour alone (Principle XIII).
 */
export function NavLinks({ isOwner, onNavigate }: { isOwner: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = isOwner ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  return (
    <ul className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(href, pathname);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-md border-l-4 px-3 py-2 text-sm ${
                active
                  ? "border-brand bg-brand/10 font-semibold text-brand"
                  : "border-transparent hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
