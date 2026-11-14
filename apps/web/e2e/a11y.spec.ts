import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { loadDemoFromSettings } from "./helpers/data";
import { seedAccounts, seedLists, uniqueEmail } from "./helpers/db";
import { ensureOwner, signInUI } from "./helpers/owner";
import { monthAfter, monthParam, openPlan, planRow, thisMonth } from "./helpers/plan";
import { seedDemoTransactions } from "./helpers/transactions";
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
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press("Tab");
    order.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim() ?? ""));
  }
  expect(order.slice(0, 9)).toEqual(["Hide balances", "Dashboard", "Accounts", "People", "Transactions", "Reports", "Payment plan", "Warranties", "Settings"]);
  // Focus is visibly outlined (not colour of text alone).
  // Focus is on stop 9; two Shift+Tabs go back to stop 7, "Payment plan" (R3 added People, R6 Reports, R9 Warranties).
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
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
  // Drop only once the move has registered; on a slow runner Space can otherwise land first.
  await expect(page.getByText(/Joint Current is over position 2/)).toBeAttached();
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

test("R4 transactions: list, To confirm, filters, bulk bar, every form type, split editor, interest (T055)", async ({ page, request }) => {
  test.slow(); // many page scans over the demo data
  await ensureOwner(request);
  const member = uniqueEmail("a11ytx");
  await createMember(request, member);
  await signInUI(page, member);
  await seedAccounts(member, { demo: true });
  await seedLists(member, { demo: true });
  await seedDemoTransactions(member);

  await page.goto("/people");
  const ravi = (await page.locator("[data-person-name='Ravi Kumar']").getByRole("link").getAttribute("href"))!;
  await page.goto("/accounts");
  const savings = (await page.locator("[data-account-row]").getByRole("link", { name: "Everyday Savings" }).getAttribute("href"))!;
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/transactions", "/transactions/new", ravi, savings]) {
      await page.goto(path);
      await expectNoViolations(page, `${path} @${width}px`);
    }
  }

  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/transactions");
  await expect(page.getByRole("region", { name: /To confirm/ })).toBeVisible();
  await page.getByRole("search", { name: "Find transactions" }).getByText("Filters", { exact: true }).click();
  await page.getByRole("list", { name: "Transactions", exact: true }).getByRole("checkbox").first().check();
  await expect(page.getByRole("region", { name: "Change selected transactions" })).toBeVisible();
  await expectNoViolations(page, "filters open and bulk bar");

  await page.goto("/transactions/new");
  for (const type of ["Income", "Refund", "Transfer", "Person"]) {
    await page.getByRole("group", { name: "Type" }).getByText(type, { exact: true }).click();
    await expectNoViolations(page, `form: ${type}`);
  }
  await page.getByRole("group", { name: "Type" }).getByText("Expense", { exact: true }).click();
  // Keyboard: the payee combobox opens, offers to add a new one, and Enter chooses.
  const payee = page.getByRole("combobox", { name: "Payee (optional)" });
  await payee.focus();
  await page.keyboard.type("Brand new shop");
  await expect(page.getByRole("option", { name: "Add “Brand new shop” as a new business" })).toBeVisible();
  await expectNoViolations(page, "payee combobox open");
  await page.keyboard.press("Enter");
  await expect(payee).toHaveValue("Brand new shop (new business)");
  await page.getByLabel("Amount", { exact: true }).fill("4,500.00");
  await page.getByRole("button", { name: "Split into lines" }).click();
  await page.getByRole("button", { name: "Add line" }).click();
  await expectNoViolations(page, "split editor");
});

test("R6 Dashboard, Reports (each view, table, keyboard) and a person statement (T021)", async ({ page, request }) => {
  test.slow(); // many page scans over the demo data
  await ensureOwner(request);
  const member = uniqueEmail("a11yrpt");
  await createMember(request, member);
  await signInUI(page, member);
  await seedAccounts(member, { demo: true });
  await seedLists(member, { demo: true });
  await seedDemoTransactions(member);

  await page.goto("/people");
  const ravi = (await page.locator("[data-person-name='Ravi Kumar']").getByRole("link").getAttribute("href"))!;
  const pages = ["/", "/reports?view=spending&period=last_month", "/reports?view=income&period=last_month", "/reports?view=trend", `${ravi}/statement`];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of pages) {
      await page.goto(path);
      await expectNoViolations(page, `${path} @${width}px`);
    }
  }

  // The table view, a drill step and the safe-to-spend buffer form, by keyboard.
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/reports?view=spending&period=last_month");
  await page.getByText("Show as table").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("details table")).toBeVisible();
  await expectNoViolations(page, "reports table open");
  await page.getByRole("list", { name: "Spending by category" }).getByRole("link").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("All spending");
  await expectNoViolations(page, "reports second level");
  await page.goto("/");
  await page.getByRole("button", { name: "Change buffer" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Buffer to keep")).toBeVisible();
  await expectNoViolations(page, "dashboard buffer form");
});

test("R5 Settings › Your data: both states and both dialogs, keyboard only (T023)", async ({ page, request }) => {
  test.slow();
  await ensureOwner(request);
  const member = uniqueEmail("a11ydata");
  await createMember(request, member);
  await signInUI(page, member);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/settings");
    await expectNoViolations(page, `settings (empty) @${width}px`);
  }
  await page.setViewportSize({ width: 1280, height: 844 });
  const section = page.getByRole("region", { name: "Your data" });
  await section.getByRole("button", { name: "Load demo data" }).click();
  await expectNoViolations(page, "load dialog");
  await page.getByRole("dialog", { name: "Load demo data?" }).getByRole("button", { name: "Load demo data" }).click();
  await expect(section.getByRole("status")).toContainText("Demo data loaded", { timeout: 20_000 });
  await expectNoViolations(page, "settings (with data)");

  // Keyboard: open the reset dialog, type the word, the button becomes available; Escape closes it.
  await section.getByRole("button", { name: "Reset my data" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Reset your data?" });
  await expect(dialog).toBeVisible();
  await expectNoViolations(page, "reset dialog");
  await dialog.getByLabel("Type RESET to confirm").focus();
  await page.keyboard.type("RESET");
  await expect(dialog.getByRole("button", { name: "Reset my data" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("R7 Payment plan: month views with the nudge, the item form, the link dialog and Pay by keyboard (T037, SC-007)", async ({ page, request }) => {
  test.slow(); // many page scans over the demo plan
  // The 26th of this month in the browser, so the month-check nudge is on the screens scanned.
  await page.clock.setFixedTime(new Date(`${thisMonth.slice(0, 8)}26T12:00:00+05:30`));
  await ensureOwner(request);
  const member = uniqueEmail("a11yplan");
  await createMember(request, member);
  await signInUI(page, member);
  await loadDemoFromSettings(page);

  await openPlan(page);
  const edit = (await planRow(page, "Home loan EMI").getByRole("link", { name: "Home loan EMI", exact: true }).getAttribute("href"))!;
  const pages = ["/payment-plan", `/payment-plan?month=${monthParam(monthAfter(1))}`, `/payment-plan?month=${monthParam(monthAfter(-1))}`, "/payment-plan/new", edit, "/"];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of pages) {
      await page.goto(path);
      if (path === "/payment-plan" || path === "/") await expect(page.locator("#plan-nudge")).toBeVisible();
      await expectNoViolations(page, `${path} @${width}px`);
    }
  }

  // The row's amount form and the link dialog.
  await page.setViewportSize({ width: 1280, height: 844 });
  await openPlan(page);
  const emi = planRow(page, "Home loan EMI");
  await emi.getByRole("button", { name: /^Set amount/ }).click();
  await expectNoViolations(page, "set amount open");
  await emi.getByRole("button", { name: /^Link existing/ }).click();
  await expect(page.getByRole("dialog", { name: "Link a payment to Home loan EMI" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("status").or(page.getByRole("dialog").getByRole("list"))).toBeVisible();
  await expectNoViolations(page, "link dialog");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Pay with the keyboard only: Enter on Pay, then Enter on Save.
  await emi.getByRole("link", { name: /^Pay/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Pay Home loan EMI" })).toBeVisible();
  await expectNoViolations(page, "pay form");
  await page.getByRole("button", { name: "Save", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/payment-plan\?month=/);
  await expect(planRow(page, "Home loan EMI")).toHaveAttribute("data-status", "paid");
});

test("R8 Quick add: the list, the Dashboard strip, Manage templates and the template form; Record, Undo and reorder by keyboard (T022, SC-006)", async ({ page, request }) => {
  test.slow();
  await ensureOwner(request);
  const member = uniqueEmail("a11ytpl");
  await createMember(request, member);
  await signInUI(page, member);
  await loadDemoFromSettings(page);

  await page.goto("/templates");
  const edit = (await page.locator("[data-manage-template='Milk']").getByRole("link", { name: "Edit Milk" }).getAttribute("href"))!;
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/transactions", "/", "/templates", "/templates/new", edit]) {
      await page.goto(path);
      await expectNoViolations(page, `${path} @${width}px`);
    }
  }

  // Keyboard only: Record with Enter in the amount box, the status with Undo, then Undo.
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/transactions");
  const groceries = page.locator("#quick-add [data-template='Groceries']");
  await groceries.getByLabel("Amount for Groceries").focus();
  await page.keyboard.type("1,240.00");
  await page.keyboard.press("Enter");
  await expect(page.locator("#quick-add-done")).toHaveText("Recorded Groceries, ₹1,240.00, today");
  await expectNoViolations(page, "recorded status with Undo");
  await page.getByRole("status").filter({ has: page.locator("#quick-add-done") }).getByRole("button", { name: "Undo" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#quick-add-done")).toHaveCount(0);

  // The repeat check is a labelled dialog.
  const milk = page.locator("#quick-add [data-template='Milk']");
  await milk.getByRole("button", { name: "Record Milk" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#quick-add-done")).toBeVisible();
  await milk.getByRole("button", { name: "Record Milk" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Record it again?" })).toBeVisible();
  await expectNoViolations(page, "record again dialog");
  await page.keyboard.press("Escape");

  // Reorder with buttons, by keyboard.
  await page.goto("/templates");
  await page.locator("[data-manage-template='Fuel']").getByRole("button", { name: "Move to top Fuel" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-manage-template]").first()).toHaveAttribute("data-manage-template", "Fuel");
});

test("R9 Warranties, the Dashboard reminders, a transaction with attachments and warranty, and Settings; Got it and Delete by keyboard (T029, SC-006)", async ({ page, request }) => {
  test.slow();
  await ensureOwner(request);
  const member = uniqueEmail("a11yatt");
  await createMember(request, member);
  await signInUI(page, member);
  await loadDemoFromSettings(page);

  await page.goto("/warranties");
  const fridge = (await page.locator("#warranties-active").getByRole("link", { name: "Refrigerator" }).getAttribute("href"))!;
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/warranties", "/", fridge, "/transactions?warranty=1", "/settings"]) {
      await page.goto(path);
      await expectNoViolations(page, `${path} @${width}px`);
    }
  }

  // Keyboard only: Got it on the Dashboard reminder; Delete an attachment through its dialog.
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/");
  await page.locator("#warranty-reminders").getByRole("button", { name: "Got it for Refrigerator" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#warranty-reminders")).toHaveCount(0);
  await page.goto(fridge);
  await page.locator("#attachments").getByRole("button", { name: /^Delete Refrigerator receipt/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Delete this attachment?" })).toBeVisible();
  await expectNoViolations(page, "delete attachment dialog");
  await page.keyboard.press("Escape");
  await expect(page.locator("#attachments [data-attachment]")).toHaveCount(1);
});
