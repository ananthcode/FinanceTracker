"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { NavLinks } from "./NavLinks";

/**
 * Signed-in navigation frame (US5, FR-034): a sidebar from 1024 px, and below that a top bar whose
 * menu button opens the same navigation in a drawer. `actions` is the header slot for per-device
 * controls such as the hide-balances toggle (US7).
 */
export function AppShell({
  isOwner,
  actions,
  children,
}: {
  isOwner: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const drawer = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  // Close the drawer whenever the route changes (including browser back/forward).
  useEffect(() => {
    drawer.current?.close();
  }, [pathname]);

  const title = (
    <span className="text-base font-semibold">Finance Tracker</span>
  );

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col gap-4 border-r border-border p-4 lg:flex">
        <div className="flex items-center justify-between gap-2">
          {title}
          {actions}
        </div>
        <nav aria-label="Main">
          <NavLinks isOwner={isOwner} />
        </nav>
      </aside>

      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 lg:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-haspopup="dialog"
          onClick={() => drawer.current?.showModal()}
          className="rounded-md p-2 hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        {title}
        <div className="flex min-w-9 justify-end">{actions}</div>
      </header>

      <dialog
        ref={drawer}
        aria-label="Navigation"
        className="m-0 h-full max-h-none w-72 max-w-[85vw] bg-background p-4 text-foreground backdrop:bg-black/40 lg:hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close(); // click on the backdrop
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          {title}
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => drawer.current?.close()}
            className="rounded-md p-2 hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <nav aria-label="Main">
          <NavLinks isOwner={isOwner} onNavigate={() => drawer.current?.close()} />
        </nav>
      </dialog>

      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </div>
  );
}
