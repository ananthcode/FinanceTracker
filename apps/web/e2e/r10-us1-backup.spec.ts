import { writeFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { confirmReset, loadDemoFromSettings, yourData } from "./helpers/data";
import { accountsText, chooseBackup, exportFrom, importPanel } from "./helpers/exports";

/** R10 T011 — User Story 1: a backup to keep, and bringing it back (spec US1 1–6; quickstart S1-a – S1-e). */

test("export a backup, reset, import it: the same accounts and balances; not into existing data (S1-a – S1-c)", async ({ page, request }, info) => {
  test.slow();
  await newSignedInMember(page, request, "backup");
  await loadDemoFromSettings(page);
  const before = await accountsText(page);

  const backup = await exportFrom(page, "Backup (JSON)");
  expect(backup.name).toMatch(/^Finance Tracker backup \d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(backup.bytes.toString("utf8")) as { format: string; version: number; records: { transaction: unknown[] } };
  expect(json).toMatchObject({ format: "finance-tracker-backup", version: 1 });
  expect(json.records.transaction.length).toBeGreaterThan(250);

  // S1-c: data that is not empty is never mixed — Reset and import asks for RESET.
  await chooseBackup(page, backup.path);
  const panel = importPanel(page);
  await expect(panel.locator("#import-contents")).toContainText("8 accounts");
  await expect(panel.getByText("Your data is not empty.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Import", exact: true })).toHaveCount(0);

  // S1-b: reset, then import into empty data.
  await page.goto("/settings");
  await confirmReset(page, "Reset my data");
  await expect(yourData(page).getByRole("status")).toContainText("Your data was reset", { timeout: 20_000 });
  await page.reload();
  await chooseBackup(page, backup.path);
  await panel.getByRole("button", { name: "Import", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Imported: ", { timeout: 120_000 });
  await expect(panel.getByRole("status")).toContainText("8 accounts");
  expect(await accountsText(page)).toEqual(before);

  // A bad file changes nothing and says why.
  const bad = info.outputPath("not-a-backup.json");
  await writeFile(bad, '{"format":"something-else"}');
  await chooseBackup(page, bad);
  await expect(panel.getByRole("alert")).toContainText("This file is not a backup of this app.");
});

test("a locked backup asks for its password; a wrong one is refused; reset and import restores it (S1-e, US1 3, 5)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "locked");
  await loadDemoFromSettings(page);
  const before = await accountsText(page);
  const backup = await exportFrom(page, "Backup (JSON)", { password: "violet-kettle-27" });
  expect(backup.bytes.toString("utf8")).not.toContain("Everyday Savings");

  await chooseBackup(page, backup.path);
  const panel = importPanel(page);
  const password = panel.getByLabel("This backup is locked. Password");
  await password.fill("wrong-password");
  await panel.getByRole("button", { name: "Unlock" }).click();
  await expect(panel.getByRole("alert")).toContainText("The password is not right.");
  await password.fill("violet-kettle-27");
  await panel.getByRole("button", { name: "Unlock" }).click();
  await expect(panel.locator("#import-contents")).toContainText("8 accounts");

  await panel.getByRole("button", { name: "Reset and import" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset and import?" });
  await dialog.getByLabel("Type RESET to confirm").fill("RESET");
  await dialog.getByRole("button", { name: "Reset and import" }).click();
  await expect(panel.getByRole("status")).toContainText("Imported: ", { timeout: 120_000 });
  expect(await accountsText(page)).toEqual(before);
});
