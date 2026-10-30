import Link from "next/link";
import { listTags } from "@ft/db";
import { TagList } from "@/components/lists/TagList";
import { createServerSupabase } from "@/lib/supabase/server";

/** Settings › Tags (R3 US4; FR-009 – FR-011). */
export default async function TagsPage() {
  const supabase = await createServerSupabase();
  const tags = await listTags(supabase);

  return (
    <section aria-labelledby="page-title" className="flex max-w-xl flex-col gap-4">
      <Link href="/settings" className="text-sm text-brand-strong hover:underline dark:text-brand">
        ← Settings
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        Tags
      </h1>
      <TagList tags={tags} />
    </section>
  );
}
