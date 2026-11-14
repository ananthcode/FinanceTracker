import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { storedFiles } from "./helpers/attachments";
import { confirmReset, loadDemoFromSettings, yourData } from "./helpers/data";
import { userIdOf } from "./helpers/lists";

/** R9 T026 — User Story 3: storage within the free plan (spec US3 1; quickstart S3-a, S3-b; SC-004). */

test("Settings shows files and space used of 200 MB; a reset leaves no files (S3-a, S3-b)", async ({ page, request }) => {
  test.slow();
  const email = await newSignedInMember(page, request, "storage");
  const userId = await userIdOf(email);
  await page.goto("/settings");
  await expect(page.locator("#attachment-usage")).toHaveText("Attachments: 0 files, 0 bytes of 200 MB");

  await loadDemoFromSettings(page);
  await expect(yourData(page).getByRole("status")).toContainText("1 attachment added with its file.");
  await page.reload();
  await expect(page.locator("#attachment-usage")).toHaveText(/^Attachments: 1 file, \d+ (bytes|KB) of 200 MB$/);
  expect(await storedFiles(userId)).toHaveLength(1);

  await confirmReset(page, "Reset my data");
  await expect(yourData(page).getByRole("status")).toContainText("1 attachment removed with its file.", { timeout: 20_000 });
  expect(await storedFiles(userId)).toEqual([]);
  await page.reload();
  await expect(page.locator("#attachment-usage")).toHaveText("Attachments: 0 files, 0 bytes of 200 MB");
});
