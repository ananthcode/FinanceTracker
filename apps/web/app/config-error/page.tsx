import { StatusPage } from "@/components/StatusPage";

/** FR-019a: this deployment is connected to a backend of a different environment. */
export default function ConfigErrorPage() {
  return (
    <StatusPage
      title="Configuration error"
      message="This app is connected to the wrong environment, so it has stopped to protect your data. Please contact the owner."
    />
  );
}
