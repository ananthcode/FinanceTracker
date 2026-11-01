import Link from "next/link";

export interface Crumb {
  label: string;
  href: string;
}

/** Where the user is in the drill-down (R6 US2 5); every level above is a link back with the same period. */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href} className="flex items-center gap-1">
              {last ? (
                <span aria-current="page" className="font-medium">
                  {c.label}
                </span>
              ) : (
                <>
                  <Link href={c.href} className="text-brand-strong underline dark:text-brand">
                    {c.label}
                  </Link>
                  <span aria-hidden="true">›</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
