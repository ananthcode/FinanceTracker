import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { uniqueEmail } from "./helpers/db";
import { ensureOwner, signInUI } from "./helpers/owner";
import { createMember } from "./helpers/users";

/** T120 — automated WCAG 2.1 AA scan of the web shell, settings, admin and public pages (Principle XIII). */
async function expectNoViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, `${label} has accessibility violations`).toEqual([]);
}

test("public pages", async ({ page }) => {
  for (const path of ["/sign-in", "/forgot-password", "/unavailable", "/signed-out"]) {
    await page.goto(path);
    await expectNoViolations(page, path);
  }
});

test("signed-in shell, placeholders and settings (desktop and phone widths)", async ({ page, request }) => {
  await ensureOwner(request);
  const member = uniqueEmail("a11y");
  await createMember(request, member);
  await signInUI(page, member);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/", "/accounts", "/transactions", "/payment-plan", "/settings"]) {
      await page.goto(path);
      await expectNoViolations(page, `${path} @${width}px`);
    }
  }
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expectNoViolations(page, "navigation drawer");
});

test("keyboard only: Tab reaches the navigation in order and Enter opens a section", async ({ page, request }) => {
  await ensureOwner(request);
  const member = uniqueEmail("keys");
  await createMember(request, member);
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInUI(page, member);
  await page.goto("/");

  const order: string[] = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    order.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim() ?? ""));
  }
  expect(order.slice(0, 7)).toEqual(["Hide balances", "Dashboard", "Accounts", "Transactions", "Payment plan", "Settings", order[6]]);
  // Focus is visibly outlined (not colour of text alone).
  // Focus is on stop 8; three Shift+Tabs go back to stop 5, "Payment plan".
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+Tab");
  await expect(page.locator(":focus")).toHaveText("Payment plan");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Payment plan" })).toBeVisible();
});

test("admin area", async ({ page, request }) => {
  const owner = await ensureOwner(request);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInUI(page, owner);
  await page.goto("/admin");
  await expectNoViolations(page, "/admin");
});
