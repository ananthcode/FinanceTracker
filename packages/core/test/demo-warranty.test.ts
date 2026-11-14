import { describe, expect, it } from "vitest";
import { Change, DEFAULT_PREFERENCES, demoAttachmentIds, demoChanges, demoReceipt, demoTransactions, textPdf, warrantyReminder } from "../src";

const TODAY = "2026-11-14";

describe("demo warranties and receipt (R9 FR-014)", () => {
  it("marks two purchases under warranty, one inside its first reminder", () => {
    const withWarranty = demoTransactions(TODAY).transactions.filter((t) => t.warrantyUntil !== null);
    expect(withWarranty.map((t) => t.notes).sort()).toEqual(["Mobile phone", "Refrigerator"]);
    const fridge = withWarranty.find((t) => t.notes === "Refrigerator")!;
    expect(warrantyReminder(TODAY, fridge.warrantyUntil, 0, DEFAULT_PREFERENCES)).toBe(1);
  });

  it("attaches one synthetic receipt to the refrigerator, with the PDF's exact size", () => {
    const changes = demoChanges(TODAY);
    const [id] = demoAttachmentIds(changes);
    const change = changes.find((c) => c.entityId === id)!;
    const receipt = demoReceipt(TODAY)!;
    expect(Change.safeParse(change).success).toBe(true);
    expect((change.fields as { sizeBytes: string }).sizeBytes).toBe(String(receipt.bytes.length));
    const fridgeCreate = changes.find((c) => c.entity === "transaction" && (c.fields as { notes?: string }).notes === "Refrigerator")!;
    expect((change.fields as { transactionId: string }).transactionId).toBe(fridgeCreate.entityId);
    expect(changes.indexOf(change)).toBeGreaterThan(changes.indexOf(fridgeCreate));
  });

  it("writes a well-formed one-page PDF that says it is made up", () => {
    const text = new TextDecoder().decode(demoReceipt(TODAY)!.bytes);
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.endsWith("%%EOF\n")).toBe(true);
    expect(text).toContain("NOT A REAL PURCHASE");
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(text.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true));
    expect(new TextDecoder().decode(textPdf(["a (b) \\ c"]))).toContain("(a \\(b\\) \\\\ c) Tj");
  });
});
