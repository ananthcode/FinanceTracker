import type { Page } from "@playwright/test";
import { keysBetween } from "@ft/core";
import { expect, test } from "./fixtures";
import { admin, seedAccounts, seedLists, uniqueEmail } from "./helpers/db";
import { ensureOwner, signInUI } from "./helpers/owner";
import { createMember } from "./helpers/users";

/**
 * R8 T022 — SC-004: with 100 templates the quick-add list is shown within 1 second, and a recording
 * appears within 1 second of the selection.
 *
 * Runs only against a production build (E2E_PRODUCTION=1), as the R2–R7 performance checks.
 */
test.skip(process.env.E2E_PRODUCTION !== "1", "SC-004 is measured against a production build (E2E_PRODUCTION=1)");

async function timed(page: Page, label: string, limit: number, step: () => Promise<void>) {
  const started = Date.now();
  await step();
  const elapsed = Date.now() - started;
  test.info().annotations.push({ type: "elapsed", description: `${label}: ${elapsed} ms` });
  console.log(`SC-004 ${label}: ${elapsed} ms`);
  expect(elapsed, `${label} took ${elapsed} ms`).toBeLessThan(limit);
}

test("quick add with 100 templates < 1 s; a recording < 1 s (SC-004)", async ({ page, request }) => {
  test.setTimeout(120_000);
  await ensureOwner(request);
  const member = uniqueEmail("perftpl");
  await createMember(request, member);
  await seedAccounts(member, { demo: true });
  await seedLists(member, { demo: true });
  const db = admin();
  const { data: profile } = await db.from("profiles").select("user_id").eq("email", member).single();
  const userId = profile!.user_id as string;
  const { data: account } = await db.from("accounts").select("id").eq("user_id", userId).eq("name", "Cash in hand").single();
  const keys = keysBetween(null, null, 100);
  const { error } = await db.from("transaction_templates").insert(
    keys.map((sortKey, i) => ({
      id: crypto.randomUUID(), user_id: userId, name: `Template ${i + 1}`, kind: "expense", flow: "out",
      account_id: account!.id, amount_minor: String(1_000 + i), sort_key: sortKey, server_seq: 0,
    })),
  );
  if (error) throw new Error(error.message);

  await page.setViewportSize({ width: 1280, height: 900 });
  await signInUI(page, member);
  await page.goto("/transactions"); // warm caches
  await page.goto("/settings");
  await timed(page, "quick-add list", 1000, async () => {
    await page.goto("/transactions");
    await expect(page.locator("#quick-add [data-template]")).toHaveCount(100);
  });
  await timed(page, "recording", 1000, async () => {
    await page.locator("#quick-add [data-template='Template 1']").getByRole("button", { name: "Record Template 1" }).click();
    await expect(page.locator("#quick-add-done")).toBeVisible();
  });
});
