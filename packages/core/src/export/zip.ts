/**
 * A small ZIP writer and reader (R10-03): stored entries with CRC-32, UTF-8 names. Enough for the CSV bundle,
 * the XLSX container and backups with attachments; the reader also takes deflated entries when the caller
 * supplies an inflater (browsers: DecompressionStream("deflate-raw")).
 */

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const utf8 = new TextEncoder();

/** DOS date/time for the archive (local fields; only informational). */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/** A ZIP of the entries, stored (no compression), in the given order. */
export function zip(entries: readonly ZipEntry[], when: Date = new Date()): Uint8Array {
  const { time, date } = dosDateTime(when);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = utf8.encode(e.name);
    const crc = crc32(e.bytes);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.bytes.length, true);
    lv.setUint32(22, e.bytes.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, time, true);
    dv.setUint16(14, date, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, e.bytes.length, true);
    dv.setUint32(24, e.bytes.length, true);
    dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true);
    dir.set(name, 46);
    parts.push(local, e.bytes);
    central.push(dir);
    offset += local.length + e.bytes.length;
  }
  const dirSize = central.reduce((s, d) => s + d.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + dirSize + 22);
  let at = 0;
  for (const p of [...parts, ...central, end]) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** True when the bytes start like a ZIP file. */
export const isZip = (bytes: Uint8Array) => bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

export type Inflater = (raw: Uint8Array) => Promise<Uint8Array>;

/** Reads a ZIP's entries; throws "NOT_A_ZIP" / "ZIP_DAMAGED" / "ZIP_UNSUPPORTED". */
export async function unzip(bytes: Uint8Array, inflate?: Inflater): Promise<ZipEntry[]> {
  if (!isZip(bytes)) throw new Error("NOT_A_ZIP");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP_DAMAGED");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new Error("ZIP_DAMAGED");
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (localAt + 30 > bytes.length || view.getUint32(localAt, true) !== 0x04034b50) throw new Error("ZIP_DAMAGED");
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    if (dataAt + size > bytes.length) throw new Error("ZIP_DAMAGED");
    const raw = bytes.slice(dataAt, dataAt + size);
    let data: Uint8Array;
    if (method === 0) data = raw;
    else if (method === 8 && inflate) data = await inflate(raw);
    else throw new Error("ZIP_UNSUPPORTED");
    if (crc32(data) !== crc) throw new Error("ZIP_DAMAGED");
    if (!name.endsWith("/")) out.push({ name, bytes: data });
  }
  return out;
}
