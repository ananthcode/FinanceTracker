import { SignInForm } from "./SignInForm";

const NOTICES: Record<string, string> = {
  idle: "You were signed out after 30 minutes of inactivity.",
  invite_required: "There's no invitation for that Google account's email. Ask the owner to invite you.",
  inactive: "Your access has been disabled. Contact the owner.",
  oauth: "Google sign-in isn't available right now. Please try again.",
  reset: "Your password was changed. Please sign in.",
};

/** /sign-in — Google or email + password (US2, FR-006, FR-010). */
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const key = String(params.reason ?? params.error ?? "");
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/";
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      {NOTICES[key] && (
        <p role="status" id="sign-in-notice" className="rounded-md border border-border p-3 text-sm">
          {NOTICES[key]}
        </p>
      )}
      <SignInForm next={next} />
    </main>
  );
}
