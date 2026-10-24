import { resetSyntheticData } from "./helpers/db";
import { clearInbox } from "./helpers/mailpit";

/** Runs once before the E2E suite: clean synthetic data on the LOCAL stack only. */
export default async function globalSetup(): Promise<void> {
  await resetSyntheticData();
  await clearInbox();
}
