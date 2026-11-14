import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { jpegSize, makePng, SAMPLE_PDF, storedFiles } from "./helpers/attachments";
import { loadDemoFromSettings } from "./helpers/data";
import { userIdOf } from "./helpers/lists";
import { transactionRows } from "./helpers/transactions";

/** R9 T016 — User Story 1: receipts kept with transactions (spec US1 1–6; quickstart S1-a – S1-d; FR-001 – FR-007). */

test("attach a photo (made smaller) and a PDF, open them, delete one; refusals; deleting the transaction takes its files", async ({ page, request }) => {
  test.slow();
  const email = await newSignedInMember(page, request, "attach");
  await loadDemoFromSettings(page);
  const userId = await userIdOf(email);

  // The demo refrigerator has its synthetic receipt.
  await page.goto("/warranties");
  await page.locator("#warranties-active").getByRole("link", { name: "Refrigerator" }).click();
  const box = page.locator("#attachments");
  await expect(box.locator("[data-attachment]")).toHaveCount(1);
  await expect(box).toContainText("Refrigerator receipt (demo).pdf");
  const receipt = await page.request.get((await box.getByRole("link", { name: /^Open Refrigerator receipt/ }).getAttribute("href"))!);
  expect(receipt.status()).toBe(200);
  expect((await receipt.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // S1-a: a large photo is stored as a JPEG with its long side 2,000 pixels, well under 1 MB.
  const input = box.getByLabel("Attach a receipt");
  await input.setInputFiles({ name: "IMG_2041.png", mimeType: "image/png", buffer: makePng(3000, 2000) });
  await expect(box.getByRole("status")).toContainText("Attached.", { timeout: 30_000 });
  const photo = box.locator("[data-attachment]").filter({ hasText: "IMG_2041.jpg" });
  await expect(photo).toContainText("Photo");
  const jpeg = await page.request.get((await photo.getByRole("link", { name: /^Open/ }).getAttribute("href"))!);
  expect(jpeg.headers()["content-type"]).toContain("image/jpeg");
  const bytes = await jpeg.body();
  expect(jpegSize(bytes)).toEqual({ width: 2000, height: 1333 });
  expect(bytes.length).toBeLessThan(1024 * 1024);

  // Not signed in: no file.
  const id = await photo.getAttribute("data-attachment");
  expect((await request.get(`/api/attachments/${id}`, { maxRedirects: 0 })).status()).toBe(401);

  // S1-b: a PDF, then deleted (after confirming): gone from the transaction and from storage.
  await input.setInputFiles({ name: "Warranty card.pdf", mimeType: "application/pdf", buffer: SAMPLE_PDF });
  await expect(box.locator("[data-attachment]")).toHaveCount(3, { timeout: 20_000 });
  await box.locator("[data-attachment]").filter({ hasText: "Warranty card.pdf" }).getByRole("button", { name: /^Delete/ }).click();
  await page.getByRole("dialog", { name: "Delete this attachment?" }).getByRole("button", { name: "Delete" }).click();
  await expect(box.locator("[data-attachment]")).toHaveCount(2);
  await expect.poll(() => storedFiles(userId).then((f) => f.length)).toBe(2);

  // S1-c: other types and big PDFs are refused with what is allowed.
  await input.setInputFiles({ name: "notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("x") });
  await expect(box.getByRole("alert")).toContainText("Only photos (JPEG, PNG, WebP, HEIC) and PDFs can be attached.");
  await input.setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(11 * 1024 * 1024, 32) });
  await expect(box.getByRole("alert")).toContainText("PDFs can be up to 10 MB");

  // S1-d: deleting the transaction says how many attachments go, and their files go too.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this transaction?" });
  await expect(dialog).toContainText("Its 2 attachments are deleted too.");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/warranties$/);
  await expect.poll(() => storedFiles(userId)).toEqual([]);
});

test("a receipt picked while adding is attached when the transaction is saved; a paper clip marks it (US1 6)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "attachnew");
  await loadDemoFromSettings(page);
  await page.goto("/transactions/new");
  await page.getByLabel("Amount", { exact: true }).fill("1,299.00");
  await page.getByLabel(/^Notes \(optional\)$/).fill("Kettle");
  await page.getByLabel("Attach a receipt (optional)").setInputFiles({ name: "kettle.pdf", mimeType: "application/pdf", buffer: SAMPLE_PDF });
  await expect(page.getByText("1 chosen.")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/, { timeout: 20_000 });
  const row = transactionRows(page).filter({ hasText: "Kettle" });
  await expect(row.locator("[data-has-attachments]")).toHaveText(/1 attachment/);
  await row.getByRole("link").first().click();
  await expect(page.locator("#attachments [data-attachment]")).toHaveCount(1);
  await expect(page.locator("#attachments")).toContainText("kettle.pdf");
});
