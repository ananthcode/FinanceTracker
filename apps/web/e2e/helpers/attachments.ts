import { deflateSync } from "node:zlib";
import { ATTACHMENTS_BUCKET } from "@ft/db";
import { admin } from "./db";

/** R9 e2e helpers: synthetic files (no real receipts) and the user's stored files. */

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** A PNG photo of `width` × `height` with a noisy pattern (so it does not compress to nothing). */
export function makePng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  let seed = 7;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const i = y * row + 1 + x * 3;
      raw[i] = (x * 255) / width + (seed & 63);
      raw[i + 1] = (y * 255) / height;
      raw[i + 2] = seed & 255;
    }
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 1 })), chunk("IEND", Buffer.alloc(0))]);
}

/** A tiny synthetic PDF. */
export const SAMPLE_PDF = Buffer.from("%PDF-1.4\n% synthetic e2e file\n%%EOF\n");

/** A JPEG's width and height (from its first SOF marker). */
export function jpegSize(bytes: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error("not a JPEG");
    const marker = bytes[i + 1]!;
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  throw new Error("no size in JPEG");
}

/** The names of a user's stored attachment files. */
export async function storedFiles(userId: string): Promise<string[]> {
  const { data } = await admin().storage.from(ATTACHMENTS_BUCKET).list(userId, { limit: 1000 });
  return (data ?? []).filter((o) => o.id !== null).map((o) => o.name);
}
