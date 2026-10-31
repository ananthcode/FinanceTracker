import { expect, test } from "@playwright/test";
import { newSignedInMember } from "./helpers/accounts";

/** R3 T056 — User Story 4: free-form tags (spec US4 scenarios 1–3; quickstart S4-a). */

async function addTag(page: import("@playwright/test").Page, name: string) {
  await page.getByLabel("New tag").fill(name);
  await page.getByRole("button", { name: "Add tag" }).click();
  await expect(page.locator(`[data-tag-name='${name}']`)).toBeVisible();
}

const names = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Tags" }).locator("[data-tag-name]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-tag-name")));

test("create, rename, merge and delete tags (US4 1–3, S4-a)", async ({ page, request }) => {
  await newSignedInMember(page, request, "tags");
  await page.goto("/settings");
  await page.getByRole("link", { name: "Tags", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tags" })).toBeVisible();

  await addTag(page, "Goa trip");
  await addTag(page, "Diwali 2026");
  await addTag(page, "diwali");
  expect(await names(page)).toEqual(["diwali", "Diwali 2026", "Goa trip"]); // alphabetical, ignoring case

  // Names are unique ignoring case.
  await page.getByLabel("New tag").fill("GOA TRIP");
  await page.getByRole("button", { name: "Add tag" }).click();
  await expect(page.getByText("You already have a tag with this name.")).toBeVisible();

  // Rename in place.
  await page.getByRole("button", { name: "Rename Goa trip", exact: true }).click();
  await page.getByLabel("New name for Goa trip").fill("Goa trip 2026");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("[data-tag-name='Goa trip 2026']")).toBeVisible();

  // Merge "diwali" into "Diwali 2026".
  await page.getByRole("button", { name: "Merge diwali", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Merge diwali into another tag" });
  await dialog.getByLabel("Merge into").selectOption({ label: "Diwali 2026" });
  await dialog.getByRole("button", { name: "Merge" }).click();
  await expect.poll(() => names(page)).toEqual(["Diwali 2026", "Goa trip 2026"]);

  // Delete with confirmation.
  await page.getByRole("button", { name: "Delete Goa trip 2026" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete tag" }).click();
  await expect.poll(() => names(page)).toEqual(["Diwali 2026"]);
});
