import type { Page } from "@playwright/test";
import { expect } from "../fixtures";

/** R5 e2e helpers: Settings › Your data. */

export function yourData(page: Page) {
  return page.getByRole("region", { name: "Your data" });
}

/** Loads the demo household from Settings and waits for the outcome. */
export async function loadDemoFromSettings(page: Page): Promise<void> {
  await page.goto("/settings");
  await yourData(page).getByRole("button", { name: "Load demo data" }).click();
  await page.getByRole("dialog", { name: "Load demo data?" }).getByRole("button", { name: "Load demo data" }).click();
  await expect(yourData(page).getByRole("status")).toContainText("Demo data loaded", { timeout: 20_000 });
}

/** Opens a reset dialog ("Reset my data" or "Reset and load demo data") and confirms with RESET. */
export async function confirmReset(page: Page, button: "Reset my data" | "Reset and load demo data"): Promise<void> {
  await yourData(page).getByRole("button", { name: button }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type RESET to confirm").fill("RESET");
  await dialog.getByRole("button", { name: button === "Reset my data" ? "Reset my data" : "Reset and load" }).click();
}
