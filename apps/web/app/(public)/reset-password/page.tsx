import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ResetForm } from "./ResetForm";

/**
 * /reset-password — reached via /auth/confirm, which verified the one-time link and created a
 * recovery session in HttpOnly cookies (FR-008).
 */
export default async function ResetPasswordPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/forgot-password?error=link");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <ResetForm email={data.user.email ?? ""} />
    </main>
  );
}
