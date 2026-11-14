import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { confirmReset, loadDemoFromSettings, yourData } from "./helpers/data";
import { chooseBackup, exportFrom, filesIn, importPanel } from "./helpers/exports";

/** R10 T018 — User Story 3: receipts in the backup, restored by import (spec US3 1–3; quickstart S3-a; clarify Q2). */

test("a backup with attachments is a zip; after a reset, importing it puts the demo receipt back (S3-a)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "receipts");
  await loadDemoFromSettings(page);
  const backup = await exportFrom(page, "Backup (JSON)", { files: true });
  expect(backup.name).toMatch(/\.zip$/);
  const entries = (await filesIn(backup.bytes)).map((e) => e.name);
  expect(entries[0]).toBe("backup.json");
  expect(entries.some((n) => /^attachments\/001 \d{4}-\d{2}-\d{2} Refrigerator receipt \(demo\)\.pdf$/.test(n))).toBe(true);

  await page.goto("/settings");
  await confirmReset(page, "Reset my data");
  await expect(yourData(page).getByRole("status")).toContainText("Your data was reset", { timeout: 20_000 });
  await page.reload();
  await chooseBackup(page, backup.path);
  const panel = importPanel(page);
  await expect(panel.getByLabel(/^Restore the attachment files \(1,/)).toBeChecked();
  await panel.getByRole("button", { name: "Import", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("1 attachment file restored.", { timeout: 120_000 });

  await page.goto("/warranties");
  await page.locator("#warranties-active").getByRole("link", { name: "Refrigerator" }).click();
  await expect(page.locator("#attachments [data-attachment]")).toHaveCount(1, { timeout: 20_000 });
  const href = await page.locator("#attachments").getByRole("link", { name: /^Open Refrigerator receipt/ }).getAttribute("href");
  expect(((await (await page.request.get(href!)).body()).subarray(0, 5)).toString()).toBe("%PDF-");
});

test("CSV with attachments includes the files and names them in the Attachments table", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "csvfiles");
  await loadDemoFromSettings(page);
  const csv = await exportFrom(page, "CSV files (zip)", { files: true });
  const files = new Map((await filesIn(csv.bytes)).map((e) => [e.name, e.bytes]));
  const path = [...files.keys()].find((n) => n.startsWith("attachments/"))!;
  expect(path).toMatch(/Refrigerator receipt \(demo\)\.pdf$/);
  expect(new TextDecoder().decode(files.get("attachments.csv")!)).toContain(path);
});
