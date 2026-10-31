import { test as base, type Page } from "@playwright/test";

export { expect } from "@playwright/test";

/**
 * Waits until React has taken over the page (`<html data-hydrated>`, set by components/HydrationMark):
 * a field filled or a button clicked before that is lost, which made tests flaky on a busy machine.
 */
export async function waitHydrated(page: Page): Promise<void> {
  await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout: 30_000 });
}

/** Playwright's `test` whose page waits to be interactive after every `goto` and `reload`. */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);
    page.goto = async (...args: Parameters<Page["goto"]>) => {
      const response = await goto(...args);
      await waitHydrated(page);
      return response;
    };
    page.reload = async (...args: Parameters<Page["reload"]>) => {
      const response = await reload(...args);
      await waitHydrated(page);
      return response;
    };
    await provide(page);
  },
});
