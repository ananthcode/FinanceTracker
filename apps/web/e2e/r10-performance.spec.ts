import { expect, test } from "./fixtures";
import { seedAccounts, seedLists, uniqueEmail } from "./helpers/db";
import { confirmReset, yourData } from "./helpers/data";
import { chooseBackup, exportFrom, importPanel } from "./helpers/exports";
import { ensureOwner, signInUI } from "./helpers/owner";
import { seedManyTransactions } from "./helpers/transactions";
import { createMember } from "./helpers/users";

/**
 * R10 T020 — SC-002: a backup of 20,000 transactions is exported in under 30 s and imported in under 2 minutes.
 *
 * Runs only against a production build (E2E_PRODUCTION=1), as the R2–R9 performance checks.
 */
test.skip(process.env.E2E_PRODUCTION !== "1", "SC-002 is measured against a production build (E2E_PRODUCTION=1)");

test("20,000 transactions: export < 30 s, import < 2 min (SC-002)", async ({ page, request }) => {
  test.setTimeout(600_000);
  await ensureOwner(request);
  const member = uniqueEmail("perfexp");
  await createMember(request, member);
  await seedAccounts(member, { demo: true });
  await seedLists(member, { demo: true });
  // Dated after the demo accounts opened, so every record passes the import's checks.
  await seedManyTransactions(member, 20_000, 400);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInUI(page, member);

  let started = Date.now();
  const backup = await exportFrom(page, "Backup (JSON)");
  const exported = Date.now() - started;
  console.log(`SC-002 export: ${exported} ms`);
  expect(exported).toBeLessThan(30_000);

  await page.goto("/settings");
  await confirmReset(page, "Reset my data");
  await expect(yourData(page).getByRole("status")).toContainText("Your data was reset", { timeout: 60_000 });
  await page.reload();
  await chooseBackup(page, backup.path);
  started = Date.now();
  await importPanel(page).getByRole("button", { name: "Import", exact: true }).click();
  await expect(importPanel(page).getByRole("status")).toContainText("20,000 transactions", { timeout: 180_000 });
  const imported = Date.now() - started;
  console.log(`SC-002 import: ${imported} ms`);
  expect(imported).toBeLessThan(120_000);
});
