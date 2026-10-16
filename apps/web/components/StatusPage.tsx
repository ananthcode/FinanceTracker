import Link from "next/link";

/** Simple full-page message used by status routes (config error, unavailable, signed out…). */
export function StatusPage({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: { href: string; label: string };
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p>{message}</p>
      {action && (
        <Link href={action.href} className="text-brand underline">
          {action.label}
        </Link>
      )}
    </main>
  );
}
