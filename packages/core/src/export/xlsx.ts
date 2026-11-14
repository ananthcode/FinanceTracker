/**
 * A minimal Excel workbook (Office Open XML) for the spreadsheet export (R10-03, FR-003, FR-005): one
 * worksheet per table, a bold frozen header row, text as inline strings (never formulas), dates as dates,
 * amounts as numbers in rupees shown in the user's number format (Indian grouping or international).
 */
import type { NumberFormat } from "../money/format";
import { rupeesText, type Cell, type ExportTable } from "./table";
import { zip } from "./zip";

const enc = new TextEncoder();

/** XML text: escaped, characters XML cannot hold removed. */
function xml(s: string): string {
  return [...s]
    .filter((ch) => {
      const c = ch.codePointAt(0)!;
      return c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || c >= 0x10000;
    })
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Column letters: 0 → A, 26 → AA. */
export function columnName(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Days since 1899-12-30 (Excel's date serial). */
export function excelSerial(iso: string): number {
  const ms = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round(ms / 86_400_000) + 25_569;
}

/** Sheet names: ≤ 31 characters, none of []:*?/\ , unique. */
function sheetNames(tables: readonly ExportTable[]): string[] {
  const used = new Set<string>();
  return tables.map((t) => {
    const base = t.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Sheet";
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

const MONEY_FORMAT: Record<NumberFormat, string> = {
  indian: "[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00",
  international: "#,##0.00;-#,##0.00",
};

const DATE_FORMAT = "dd-mmm-yyyy";

function cellXml(c: Cell, ref: string): string {
  if (c === null) return "";
  if (typeof c === "number") return `<c r="${ref}"><v>${c}</v></c>`;
  if (typeof c === "boolean") return `<c r="${ref}" t="inlineStr"><is><t>${c ? "Yes" : "No"}</t></is></c>`;
  if (typeof c === "string") return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(c)}</t></is></c>`;
  if ("date" in c) return `<c r="${ref}" s="1"><v>${excelSerial(c.date)}</v></c>`;
  return `<c r="${ref}" s="2"><v>${rupeesText(c.money)}</v></c>`;
}

function sheetXml(t: ExportTable): string {
  const widths = t.columns.map((col, i) => {
    const longest = Math.max(col.length, ...t.rows.slice(0, 200).map((r) => {
      const c = r[i];
      return typeof c === "string" ? Math.min(c.length, 60) : c === null ? 0 : 14;
    }));
    return `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, longest + 2)}" customWidth="1"/>`;
  });
  const header = `<row r="1">${t.columns.map((c, i) => `<c r="${columnName(i)}1" t="inlineStr" s="3"><is><t xml:space="preserve">${xml(c)}</t></is></c>`).join("")}</row>`;
  const rows = t.rows.map((r, y) => `<row r="${y + 2}">${r.map((c, x) => cellXml(c, `${columnName(x)}${y + 2}`)).join("")}</row>`);
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    (widths.length > 0 ? `<cols>${widths.join("")}</cols>` : "") +
    `<sheetData>${header}${rows.join("")}</sheetData></worksheet>`
  );
}

/** The workbook's bytes (.xlsx). */
export function toXlsx(tables: readonly ExportTable[], prefs: { numberFormat: NumberFormat }, when: Date = new Date()): Uint8Array {
  const names = sheetNames(tables);
  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        `</Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        `</sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      "xl/styles.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<numFmts count="2"><numFmt numFmtId="164" formatCode="${xml(DATE_FORMAT)}"/><numFmt numFmtId="165" formatCode="${xml(MONEY_FORMAT[prefs.numberFormat])}"/></numFmts>` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ],
    ...tables.map((t, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(t)]),
  ];
  return zip(
    files.map(([name, text]) => ({ name, bytes: enc.encode(text) })),
    when,
  );
}
