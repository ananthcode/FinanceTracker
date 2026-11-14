/**
 * Attachment rules shared by every client (R9-04): what can be picked, how photos are resized, the
 * allowance, and sizes in words. The device does the drawing; these are the numbers.
 */
import { ATTACHMENT_ALLOWANCE, ATTACHMENT_MAX_BYTES, ATTACHMENT_NAME_MAX } from "./schemas";

/** Photo types a user may pick; all are stored as JPEG after resizing. */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
/** A picked photo larger than this is refused before decoding (it would not fit in memory well). */
export const PHOTO_PICK_MAX_BYTES = 40 * 1024 * 1024;
/** The long side of a stored photo (FR-002). */
export const PHOTO_LONG_SIDE = 2000;

export type PickedKind = "photo" | "pdf";

const PHOTO_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

/** What a picked file is, or null when it is neither a photo nor a PDF. Browsers sometimes leave the type empty. */
export function pickedKind(type: string, name: string): PickedKind | null {
  const t = type.toLowerCase();
  if (t === "application/pdf" || (t === "" && /\.pdf$/i.test(name))) return "pdf";
  if ((PHOTO_TYPES as readonly string[]).includes(t) || (t === "" && PHOTO_EXTENSIONS.test(name))) return "photo";
  return null;
}

/** Why a picked file cannot be attached: "type" (not a photo or PDF), "size" (too big), or null. */
export function attachmentProblem(type: string, name: string, sizeBytes: number): "type" | "size" | null {
  const kind = pickedKind(type, name);
  if (kind === null) return "type";
  if (sizeBytes <= 0) return "size";
  if (kind === "pdf" && sizeBytes > ATTACHMENT_MAX_BYTES) return "size";
  if (kind === "photo" && sizeBytes > PHOTO_PICK_MAX_BYTES) return "size";
  return null;
}

/** The size a photo is drawn at: the long side at most `max`, never enlarged. */
export function fitWithin(width: number, height: number, max = PHOTO_LONG_SIDE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const scale = max / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Bytes still free of the allowance (never negative). */
export function allowanceLeft(storedBytes: bigint, allowance: bigint = ATTACHMENT_ALLOWANCE): bigint {
  return storedBytes >= allowance ? 0n : allowance - storedBytes;
}

/** "820 KB", "3.4 MB", "200 MB" (1 KB = 1,024 bytes). */
export function formatBytes(bytes: bigint | number): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} ${n === 1 ? "byte" : "bytes"}`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1).replace(/\.0$/, "") : Math.round(mb)} MB`;
}

/**
 * The stored name: the picked file's name, trimmed, `.jpg` for a converted photo, at most 120 characters
 * (the extension kept). An empty name becomes "Receipt".
 */
export function attachmentName(fileName: string, kind: PickedKind): string {
  let name = [...fileName].filter((c) => c.charCodeAt(0) >= 32).join("").trim();
  if (kind === "photo") name = name.replace(PHOTO_EXTENSIONS, "") + ".jpg";
  const dot = name.lastIndexOf(".");
  let base = dot > 0 ? name.slice(0, dot).trim() : dot === 0 ? "" : name;
  const ext = dot >= 0 ? name.slice(dot) : "";
  if (base === "") base = "Receipt";
  const room = ATTACHMENT_NAME_MAX - [...ext].length;
  return [...base].slice(0, room).join("").trim() + ext;
}
