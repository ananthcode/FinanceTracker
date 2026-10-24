import { redirect } from "next/navigation";
import { getProfile } from "@ft/db";
import { adminAuditFeed, adminOverview } from "@/lib/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminTables } from "./AdminTables";
import { AuditFeed } from "./AuditFeed";
import { InviteForm } from "./InviteForm";

/**
 * Owner-admin area (US4, FR-014–FR-016a, FR-039). Owner-only: enforced by proxy.ts, here again on
 * the server (defence in depth) and in every admin API route. Shows no financial data or preferences.
 */
export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const profile = data.user ? await getProfile(supabase, data.user.id) : null;
  if (profile?.role !== "owner") redirect("/forbidden");

  const [overview, feed] = await Promise.all([adminOverview(), adminAuditFeed(null)]);

  return (
    <section aria-labelledby="admin-title" className="flex flex-col gap-8">
      <h1 id="admin-title" className="text-2xl font-semibold">
        User management
      </h1>
      <div className="max-w-md">
        <InviteForm />
      </div>
      <AdminTables overview={overview} ownerId={profile.id} />
      <AuditFeed items={feed.items} />
    </section>
  );
}
