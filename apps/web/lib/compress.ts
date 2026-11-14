"use client";

import { fitWithin, PHOTO_LONG_SIDE } from "@ft/core";

/**
 * Makes a photo smaller on the device before it is stored (FR-002, research R9-04): drawn upright with
 * its long side at most 2,000 pixels and saved as JPEG. Drawing keeps only the pixels, so location and
 * camera details are left behind. Throws "UNREADABLE" when the browser cannot read the photo (often HEIC).
 */
export async function compressPhoto(file: Blob, quality = 0.8): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("UNREADABLE");
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height, PHOTO_LONG_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("UNREADABLE");
    // JPEG has no transparency: a white page behind transparent PNGs.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("UNREADABLE");
    return blob;
  } finally {
    bitmap.close();
  }
}
