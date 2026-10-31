import Link from "next/link";
import { listPayees } from "@ft/db";
import { PeopleList } from "@/components/lists/PeopleList";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";

/** People (R3 US3; FR-016 – FR-021, FR-034): who owes you and whom you owe. */
export default async function PeoplePage() {
  const supabase = await createServerSupabase();
  const people = await listPayees(supabase, "person");

  return (
    <section aria-labelledby="page-title" className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 id="page-title" className="mr-auto text-2xl font-semibold">
          People
        </h1>
        <Link href="/people/new" className={buttonVariants()}>
          Add person
        </Link>
      </div>
      <p className="text-muted-foreground">
        Money you have lent to or borrowed from people. Lending, repaying and paying on someone&rsquo;s behalf will move
        these balances once transactions arrive.
      </p>
      <PeopleList people={people} />
    </section>
  );
}
