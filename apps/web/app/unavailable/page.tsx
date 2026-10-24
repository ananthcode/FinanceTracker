import { StatusPage } from "@/components/StatusPage";

/** Backend unreachable or paused by the hosting provider (spec Edge Cases). */
export default function UnavailablePage() {
  return (
    <StatusPage
      title="Service temporarily unavailable"
      message="The service can't be reached right now. Please try again in a few minutes."
      action={{ href: "/", label: "Try again" }}
    />
  );
}
