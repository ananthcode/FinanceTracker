import { expect, test } from "./fixtures";
import { addAccount, newSignedInMember } from "./helpers/accounts";
import { confirmReset, yourData } from "./helpers/data";
import { accountRow } from "./helpers/transactions";

/** R5 T020 — User Story 3: start again with the demo household (spec US3 1; quickstart S3-a; SC-006). */

test("own test records are replaced by a fresh demo household in one confirmed step (US3 1, S3-a, SC-006)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "demoreload");
  await addAccount(page, { name: "My test wallet", type: "Wallet", balance: "500" });

  const started = Date.now();
  await page.goto("/settings");
  await confirmReset(page, "Reset and load demo data");
  await expect(yourData(page).getByRole("status")).toContainText("replaced with fresh demo data", { timeout: 20_000 });
  expect(Date.now() - started).toBeLessThan(60_000); // SC-006

  await page.goto("/accounts");
  await expect(accountRow(page, "Everyday Savings")).toBeVisible();
  await expect(accountRow(page, "My test wallet")).toHaveCount(0);
});
