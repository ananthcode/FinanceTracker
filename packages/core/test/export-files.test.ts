import { describe, expect, it } from "vitest";
import { columnName, crc32, excelSerial, toCsv, toXlsx, unzip, zip, type ExportTable } from "../src";

const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe("zip (R10-03)", () => {
  it("writes stored entries the reader gets back exactly, with UTF-8 names", async () => {
    const entries = [
      { name: "backup.json", bytes: new TextEncoder().encode('{"a":1}') },
      { name: "attachments/001 2026-11-14 Rasīd.pdf", bytes: new Uint8Array([0, 1, 2, 255]) },
      { name: "empty.txt", bytes: new Uint8Array() },
    ];
    const back = await unzip(zip(entries));
    expect(back.map((e) => e.name)).toEqual(entries.map((e) => e.name));
    back.forEach((e, i) => expect([...e.bytes]).toEqual([...entries[i]!.bytes]));
  });

  it("knows CRC-32 and refuses what is not a zip or is damaged", async () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    await expect(unzip(new TextEncoder().encode("hello"))).rejects.toThrow("NOT_A_ZIP");
    const bytes = zip([{ name: "a.txt", bytes: new TextEncoder().encode("abc") }]);
    bytes[30 + 5] = 0x78; // change the stored data: the CRC no longer matches
    await expect(unzip(bytes)).rejects.toThrow("ZIP_DAMAGED");
  });
});

const table: ExportTable = {
  name: "Transactions",
  file: "transactions",
  columns: ["No.", "Date", "Notes", "Amount", "Confirmed"],
  rows: [
    [1, { date: "2026-11-14" }, "Milk, curd \"fresh\"", { money: 123_450n }, true],
    [2, { date: "2026-11-15" }, "=1+1", { money: -5n }, false],
    [3, null, "line one\nline two", null, null],
  ],
};

describe("CSV (FR-003, FR-005)", () => {
  it("quotes, keeps formulas as text, writes dates and rupees plainly, with a BOM", () => {
    const csv = toCsv(table);
    expect(csv.startsWith("﻿No.,Date,Notes,Amount,Confirmed\r\n")).toBe(true);
    expect(csv).toContain('1,2026-11-14,"Milk, curd ""fresh""",1234.50,Yes\r\n');
    expect(csv).toContain("2,2026-11-15,'=1+1,-0.05,No\r\n");
    expect(csv).toContain('3,,"line one\nline two",,\r\n');
  });
});

describe("Excel workbook (FR-003, FR-005)", () => {
  it("is a zip of the expected parts, with dates as serials, amounts as numbers and text never as a formula", async () => {
    const parts = await unzip(toXlsx([table, { name: "Tags/[x]", file: "tags", columns: ["Name"], rows: [["#home"]] }], { numberFormat: "indian" }));
    const byName = new Map(parts.map((p) => [p.name, text(p.bytes)]));
    expect([...byName.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    expect(byName.get("xl/workbook.xml")).toContain('<sheet name="Transactions" sheetId="1" r:id="rId1"/>');
    expect(byName.get("xl/workbook.xml")).toContain('<sheet name="Tags  x" sheetId="2"');
    expect(byName.get("xl/styles.xml")).toContain("[&gt;=10000000]##\\,##\\,##\\,##0.00");
    const sheet = byName.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain(`<c r="B2" s="1"><v>${excelSerial("2026-11-14")}</v></c>`);
    expect(sheet).toContain('<c r="D2" s="2"><v>1234.50</v></c>');
    expect(sheet).toContain('<c r="D3" s="2"><v>-0.05</v></c>');
    expect(sheet).toContain('<c r="C2" t="inlineStr"><is><t xml:space="preserve">Milk, curd &quot;fresh&quot;</t></is></c>');
    expect(sheet).toContain('<t xml:space="preserve">=1+1</t>');
    expect(sheet).not.toContain("<f>");
  });

  it("names columns and counts days like Excel", () => {
    expect([0, 25, 26, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "ZZ", "AAA"]);
    expect(excelSerial("1900-03-01")).toBe(61);
    expect(excelSerial("2026-11-14")).toBe(46340);
  });
});
