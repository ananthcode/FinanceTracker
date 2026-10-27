import Link from "next/link";
import { listGroups } from "@ft/db";
import { GroupManager } from "@/components/accounts/GroupManager";
import { createServerSupabase } from "@/lib/supabase/server";

/** Manage your own groups for the "My groups" view (R2 US3; FR-009a, FR-009b). */
export default async function GroupsPage() {
  const supabase = await createServerSupabase();
  const groups = (await listGroups(supabase)).sort((a, b) =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : 1,
  );

  return (
    <section aria-labelledby="page-title" className="flex max-w-xl flex-col gap-4">
      <Link href="/accounts" className="text-sm text-brand-strong hover:underline dark:text-brand">
        ← Accounts
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        Groups
      </h1>
      <p className="text-muted-foreground">
        Groups are your own way to arrange accounts — for example &ldquo;My accounts&rdquo; and &ldquo;Held for
        family&rdquo;. Choose an account&rsquo;s group when you edit it, then switch the accounts screen to &ldquo;My
        groups&rdquo;. Groups never change any balance.
      </p>
      <GroupManager groups={groups} />
    </section>
  );
}
