import { InviteForm } from "./InviteForm";

/**
 * Owner-admin area (owner only — enforced in proxy.ts and every admin API route).
 * US1 provides inviting; US4 (T094) adds invitations/users tables, disable/enable, erase and audit.
 */
export default function AdminPage() {
  return (
    <section aria-labelledby="admin-title" className="flex max-w-md flex-col gap-4">
      <h1 id="admin-title" className="text-2xl font-semibold">
        User management
      </h1>
      <InviteForm />
    </section>
  );
}
