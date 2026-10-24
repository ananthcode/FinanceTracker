import { StatusPage } from "@/components/StatusPage";

/** Non-owners reaching the admin area (FR-018). */
export default function ForbiddenPage() {
  return <StatusPage title="Not available" message="You don't have access to this page." action={{ href: "/", label: "Back to home" }} />;
}
