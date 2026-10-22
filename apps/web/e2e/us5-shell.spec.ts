import { expect, test, type Page } from "@playwright/test";
import { seedInvitation, uniqueEmail } from "./helpers/db";
import { ensureOwner, signInUI } from "./helpers/owner";
import { createMember, PASSWORD } from "./helpers/users";

/** T098 — User Story 5: signed-in shell (quickstart S5-a; FR-034, FR-035). */
const ENTRIES = [
  { label: "Dashboard", path: "/", heading: "Dashboard" },
  { label: "Accounts", path: "/accounts", heading: "Accounts" },
  { label: "Transactions", path: "/transactions", heading: "Transactions" },
  { label: "Payment plan", path: "/payment-plan", heading: "Payment plan" },
  { label: "Settings", path: "/settings", heading: "Settings" },
];
const isDemo = process.env.NEXT_PUBLIC_APP_ENV === "demo";

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test("every entry opens its section with the current one highlighted (S5-a)", async ({ page, request }) => {
  await ensureOwner(request);
  const member = uniqueEmail("shell");
  await createMember(request, member);
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInUI(page, member);

  for (const entry of ENTRIES) {
    await mainNav(page).getByRole("link", { name: entry.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${entry.path === "/" ? "/$" : `${entry.path}$`}`));
    await expect(page.getByRole("heading", { level: 1, name: entry.heading })).toBeVisible();
    const current = mainNav(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(entry.label);
    if (entry.path !== "/settings") await expect(page.getByText("Coming soon")).toBeVisible();
  }

  // FR-034: members never see the user-management entry.
  await expect(mainNav(page).getByRole("link", { name: "User management" })).toHaveCount(0);
});

test("the owner-admin also sees User management (US5 scenario 4)", async ({ page, request }) => {
  const owner = await ensureOwner(request);
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInUI(page, owner);
  await mainNav(page).getByRole("link", { name: "User management" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "User management" })).toBeVisible();
  await expect(mainNav(page).locator('[aria-current="page"]')).toHaveText("User management");
});

test("below 1024 px the navigation lives in a drawer opened from the top bar", async ({ page, request }) => {
  await ensureOwner(request);
  const member = uniqueEmail("drawer");
  await createMember(request, member);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInUI(page, member);

  await expect(mainNav(page)).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Accounts" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Accounts" })).toBeVisible();
  await expect(drawer).toBeHidden(); // closes after navigating
});

test("Demo marker on every signed-in screen only in the demo environment (FR-035)", async ({ page, request }) => {
  await ensureOwner(request);
  const member = uniqueEmail("badge");
  await createMember(request, member);
  await signInUI(page, member);
  for (const entry of ENTRIES) {
    await page.goto(entry.path);
    if (isDemo) await expect(page.locator("#demo-badge")).toContainText("Demo");
    else await expect(page.locator("#demo-badge")).toHaveCount(0);
  }
});

test("no navigation until first-run setup is complete (FR-020)", async ({ page, request }) => {
  await ensureOwner(request);
  const email = uniqueEmail("presetup");
  const token = await seedInvitation(email);
  const res = await request.post(`/api/invitations/${token}/accept`, {
    headers: { "x-ft-client": "android" },
    data: { email, password: PASSWORD, keepSignedIn: false, device: "android", privacyNoticeShown: true },
  });
  expect(res.status()).toBe(201);
  await signInUI(page, email);
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open navigation" })).toHaveCount(0);
});
