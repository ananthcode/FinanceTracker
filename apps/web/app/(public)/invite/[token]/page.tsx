import { headers } from "next/headers";
import Link from "next/link";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { StatusPage } from "@/components/StatusPage";
import { ApiError } from "@/lib/api/errors";
import { clientAddressOf } from "@/lib/api/handler";
import { lookupInvitation } from "@/lib/invitations";
import { hitRateLimit } from "@/lib/rate-limit";
import { AcceptForm } from "./AcceptForm";

/** /invite/{token} — accept an invitation (US1). Also the web fallback for Android App Links. */
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const requestHeaders = await headers();
  const address = clientAddressOf(new Request("http://local", { headers: requestHeaders }));
  if (!(await hitRateLimit("invite-lookup", address, 60, 20))) {
    return <StatusPage title="Please wait" message="Too many attempts. Try again in a minute." />;
  }

  let lookup;
  try {
    lookup = await lookupInvitation(token);
  } catch (err) {
    if (err instanceof ApiError && err.code === "INVITE_NOT_FOUND") {
      return <StatusPage title="Invitation not found" message="This invitation link isn't valid. Ask the owner for a new one." />;
    }
    throw err;
  }

  if (lookup.status === "accepted") {
    return (
      <StatusPage
        title="Already joined"
        message="This invitation has already been used. Sign in to continue."
        action={{ href: "/sign-in", label: "Go to sign in" }}
      />
    );
  }
  if (lookup.status === "expired" || lookup.status === "revoked") {
    return (
      <StatusPage
        title="Invitation no longer valid"
        message={`This invitation has ${lookup.status === "expired" ? "expired" : "been withdrawn"}. Ask the owner for a new one.`}
      />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Join Finance Tracker</h1>
      <p>
        This invitation is for <strong>{lookup.emailMasked}</strong>.
      </p>
      <PrivacyNotice />
      <AcceptForm token={token} />
      <p className="text-sm text-muted-foreground">
        Using an Android phone? Install the Finance Tracker app from the link the owner shared, then open this
        invitation again — it will open in the app. Already joined? <Link href="/sign-in" className="underline">Sign in</Link>.
      </p>
    </main>
  );
}
