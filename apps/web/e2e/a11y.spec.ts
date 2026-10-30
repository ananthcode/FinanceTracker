import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seedAccounts, seedLists, uniqueEmail } from "./helpers/db";
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
  // Ten page scans plus the drawer: close to 30 s on its own, over it later in a full run.
  test.slow();
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
  expect(order.slice(0, 8)).toEqual(["Hide balances", "Dashboard", "Accounts", "People", "Transactions", "Payment plan", "Settings", order[7]]);
  // Focus is visibly outlined (not colour of text alone).
  // Focus is on stop 8; two Shift+Tabs go back to stop 6, "Payment plan" (R3 added People at stop 4).
  for (let i = 0; i < 2; i++) await page.keyboard.press("Shift+Tab");
  await expect(page.locator(":focus")).toHaveText("Payment plan");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Payment plan" })).toBeVisible();
});

test("accounts screens with the demo accounts, both views (R2 T064)", async ({ page, request }) => {
  test.slow(); // ten page scans, like the shell test above
  await ensureOwner(request);
  const member = uniqueEmail("a11yacc");
  await createMember(request, member);
  await seedAccounts(member, { demo: true });
  await signInUI(page, member);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/accounts");
    await page.locator("#archived summary").click(); // include the archived list
    await expectNoViolations(page, `/accounts by type @${width}px`);
    await page.getByRole("radio", { name: "My groups" }).click();
    await expect(page.getByRole("region", { name: "Held for family" })).toBeVisible();
    await expectNoViolations(page, `/accounts my groups @${width}px`);
    await page.getByRole("radio", { name: "By type" }).click();
    await expect(page.getByRole("region", { name: "Bank accounts" })).toBeVisible();
    for (const path of ["/accounts/new", "/accounts/groups"]) {
      await page.goto(path);
      await expectNoViolations(page, `${path} @${width}px`);
    }
    await page.goto("/accounts");
    await page.getByRole("link", { name: "Rewards Card", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Edit account" })).toBeVisible();
    await expectNoViolations(page, `/accounts/[id] @${width}px`);
  }
});

test("accounts: keyboard reordering announces positions and Move buttons work without a mouse (R2 T064)", async ({ page, request }) => {
  await ensureOwner(request);
  const member = uniqueEmail("a11ykeys");
  await createMember(request, member);
  await seedAccounts(member, { demo: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInUI(page, member);
  await page.goto("/accounts");
  const names = () => page.getByRole("region", { name: "Bank accounts" }).locator("[data-account-name]").allInnerTexts();
  await expect.poll(names).toEqual(["Everyday Savings", "Joint Current", "Family Savings"]);

  await page.getByRole("button", { name: "Move Joint Current up" }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(names).toEqual(["Joint Current", "Everyday Savings", "Family Savings"]);
  await page.waitForLoadState("networkidle"); // let the refresh after the move land before dragging

  await page.getByRole("button", { name: "Reorder Joint Current" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByText(/Picked up Joint Current, position 1 of 3/)).toBeAttached();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect.poll(names).toEqual(["Everyday Savings", "Joint Current", "Family Savings"]);
});

test("admin area", async ({ page, request }) => {
  const owner = await ensureOwner(request);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInUI(page, owner);
  await page.goto("/admin");
  await expectNoViolations(page, "/admin");
});

test("R3 lists: people, categories (start dialog, tree, manage, picker), payees and tags (T073)", async ({ page, request }) => {
  test.slow(); // many page scans
  await ensureOwner(request);
  const member = uniqueEmail("a11ylists");
  await createMember(request, member);
  await signInUI(page, member);

  // The start dialog, before any categories exist.
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/settings/categories");
  await expect(page.getByRole("dialog", { name: "How would you like to start?" })).toBeVisible();
  await expectNoViolations(page, "start dialog");

  await seedLists(member, { demo: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/people", "/people/new", "/settings/categories", "/settings/payees", "/settings/payees/new", "/settings/tags"]) {
      await page.goto(path);
      await expectNoViolations(page, `${path} @${width}px`);
    }
  }

  // Tree disclosure, the Manage panel and the merge picker are keyboard operable and pass axe.
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/settings/categories");
  const toggle = page.getByRole("button", { name: "Show sub-categories of Education", exact: true });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Hide sub-categories of Education", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Manage Kids", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Education › Kids" })).toBeVisible();
  await expectNoViolations(page, "manage panel");
  await page.getByRole("button", { name: "Merge into another category" }).click();
  const box = page.getByRole("combobox", { name: "Merge into" });
  await box.focus();
  await page.keyboard.type("swim");
  await page.keyboard.press("ArrowDown");
  await expectNoViolations(page, "merge picker open");
  await page.keyboard.press("Escape");
  await expect(box).toHaveAttribute("aria-expanded", "false");
});
