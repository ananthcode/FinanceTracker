import { StatusPage } from "@/components/StatusPage";

/** Shown after a forced sign-out (access disabled or account removed — FR-015). */
export default function SignedOutPage() {
  return (
    <StatusPage
      title="You've been signed out"
      message="Your access to this app is no longer active. If you think this is a mistake, contact the owner."
      action={{ href: "/sign-in", label: "Go to sign in" }}
    />
  );
}
