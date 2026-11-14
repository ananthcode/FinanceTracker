import { readFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { unzip, type ZipEntry } from "@ft/core";
import { expect } from "../fixtures";
import { yourData } from "./data";

/** R10 e2e helpers: Settings › Your data › Export and Import. */

export const exportPanel = (page: Page): Locator => page.locator("#export");
export const importPanel = (page: Page): Locator => page.locator("#import");

/** Exports with the chosen options from Settings; returns the downloaded file's name, path and bytes. */
export async function exportFrom(
  page: Page,
  format: "Backup (JSON)" | "Excel workbook" | "CSV files (zip)",
  options: { range?: string; files?: boolean; password?: string } = {},
): Promise<{ name: string; path: string; bytes: Buffer }> {
  await page.goto("/settings");
  const panel = exportPanel(page);
  await panel.getByText(format, { exact: true }).click();
  if (options.range) await panel.getByLabel("Transactions").selectOption({ label: options.range });
  if (options.files) await panel.getByLabel(/^Include attachments/).check();
  if (options.password) {
    await panel.getByLabel("Lock with a password").check();
    await panel.getByLabel("Password", { exact: true }).fill(options.password);
    await panel.getByLabel("Password again").fill(options.password);
  }
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), panel.getByRole("button", { name: "Export" }).click()]);
  const path = await download.path();
  await expect(panel.getByRole("status")).toContainText("Downloaded", { timeout: 30_000 });
  return { name: download.suggestedFilename(), path, bytes: await readFile(path) };
}

/** Chooses a backup file in Import and waits for its contents or a problem. */
export async function chooseBackup(page: Page, path: string): Promise<void> {
  await page.goto("/settings");
  await importPanel(page).getByLabel("Backup file").setInputFiles(path);
}

export async function filesIn(bytes: Buffer): Promise<ZipEntry[]> {
  return unzip(new Uint8Array(bytes));
}

/** The text of the accounts list (names and balances), for comparing before and after. */
export async function accountsText(page: Page): Promise<string[]> {
  await page.goto("/accounts");
  return page.locator("[data-account-row]").allInnerTexts();
}

export { yourData };
