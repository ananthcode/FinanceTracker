import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_ALLOWANCE,
  AttachmentCreateFields,
  AttachmentUpdateFields,
  Change,
  allowanceLeft,
  attachmentName,
  attachmentProblem,
  fitWithin,
  formatBytes,
  pickedKind,
} from "../src";

const MB = 1024 * 1024;

describe("what can be attached (FR-001)", () => {
  it("knows photos and PDFs, even without a browser type", () => {
    expect(pickedKind("image/jpeg", "a.jpg")).toBe("photo");
    expect(pickedKind("image/heic", "IMG_1.HEIC")).toBe("photo");
    expect(pickedKind("", "IMG_1.heic")).toBe("photo");
    expect(pickedKind("application/pdf", "bill.pdf")).toBe("pdf");
    expect(pickedKind("", "bill.PDF")).toBe("pdf");
    expect(pickedKind("application/msword", "notes.doc")).toBeNull();
    expect(pickedKind("", "notes.docx")).toBeNull();
  });

  it("refuses other types and PDFs over 10 MB", () => {
    expect(attachmentProblem("application/pdf", "bill.pdf", 300 * 1024)).toBeNull();
    expect(attachmentProblem("application/pdf", "bill.pdf", 10 * MB)).toBeNull();
    expect(attachmentProblem("application/pdf", "big.pdf", 12 * MB)).toBe("size");
    expect(attachmentProblem("image/jpeg", "photo.jpg", 12 * MB)).toBeNull(); // photos are made smaller first
    expect(attachmentProblem("image/jpeg", "huge.jpg", 41 * MB)).toBe("size");
    expect(attachmentProblem("text/plain", "a.txt", 10)).toBe("type");
    expect(attachmentProblem("image/png", "empty.png", 0)).toBe("size");
  });
});

describe("photos are made smaller (FR-002)", () => {
  it("keeps the long side at most 2,000 pixels", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(1200, 900)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(10000, 3)).toEqual({ width: 2000, height: 1 });
  });

  it("names a converted photo .jpg and keeps names within 120 characters", () => {
    expect(attachmentName("IMG_2041.HEIC", "photo")).toBe("IMG_2041.jpg");
    expect(attachmentName("  Fridge bill.pdf ", "pdf")).toBe("Fridge bill.pdf");
    expect(attachmentName(".pdf", "pdf")).toBe("Receipt.pdf");
    const long = attachmentName(`${"x".repeat(200)}.pdf`, "pdf");
    expect(long.length).toBe(120);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});

describe("allowance and sizes (clarify Q1)", () => {
  it("is 200 MB and never goes below zero", () => {
    expect(ATTACHMENT_ALLOWANCE).toBe(209_715_200n);
    expect(allowanceLeft(0n)).toBe(209_715_200n);
    expect(allowanceLeft(209_715_200n + 5n)).toBe(0n);
  });

  it("says sizes in words", () => {
    expect(formatBytes(1)).toBe("1 byte");
    expect(formatBytes(512)).toBe("512 bytes");
    expect(formatBytes(820 * 1024)).toBe("820 KB");
    expect(formatBytes(Math.round(3.4 * MB))).toBe("3.4 MB");
    expect(formatBytes(ATTACHMENT_ALLOWANCE)).toBe("200 MB");
    expect(formatBytes(2 * MB)).toBe("2 MB");
  });
});

describe("attachment records on the wire", () => {
  const tx = "6b3c1d1e-6f6a-4c3e-9a63-1f2a3b4c5d6e";
  it("needs the transaction, a name, a stored type and the size as a decimal string", () => {
    expect(AttachmentCreateFields.safeParse({ transactionId: tx, name: "a.jpg", contentType: "image/jpeg", sizeBytes: "1200" }).success).toBe(true);
    expect(AttachmentCreateFields.safeParse({ transactionId: tx, name: "a.jpg", contentType: "image/heic", sizeBytes: "1200" }).success).toBe(false);
    expect(AttachmentCreateFields.safeParse({ transactionId: tx, name: "a.jpg", contentType: "image/jpeg", sizeBytes: 1200 }).success).toBe(false);
    expect(AttachmentCreateFields.safeParse({ transactionId: tx, name: "a.pdf", contentType: "application/pdf", sizeBytes: String(11 * MB) }).success).toBe(false);
    expect(AttachmentCreateFields.safeParse({ transactionId: tx, name: " a ", contentType: "image/jpeg", sizeBytes: "1" }).success).toBe(false);
  });

  it("only renames afterwards", () => {
    expect(AttachmentUpdateFields.safeParse({ name: "Fridge.jpg" }).success).toBe(true);
    expect(AttachmentUpdateFields.safeParse({ sizeBytes: "1" }).success).toBe(false);
    const change = (kind: string) =>
      Change.safeParse({ changeId: crypto.randomUUID(), entity: "attachment", entityId: crypto.randomUUID(), kind, hlc: "1793011300000.0000.webbrw01" });
    expect(change("delete").success).toBe(true);
    expect(change("archive").success).toBe(false);
  });
});
