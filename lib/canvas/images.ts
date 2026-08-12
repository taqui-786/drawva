import { CanvasEngine } from "./engine";
import { TILE } from "./constants";
import { pasteRegion } from "./selection";
import type { Point } from "./types";

const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_DIMENSION = 2048;
const MAX_PLACE_WIDTH = 1200;

/**
 * Import a raster image into the board at a world point, scaled so it keeps
 * aspect ratio and fits within MAX_PLACE_WIDTH world units. The image is baked
 * into the ink tiles so it persists, erases, and moves like any ink.
 */
export async function placeImageAt(
  engine: CanvasEngine,
  file: Blob,
  world: Point
): Promise<void> {
  if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) throw new Error("Image too large");
  const bitmap = await createImageBitmap(file);
  if (!bitmap) throw new Error("Unreadable image");
  const naturalW = bitmap.width;
  const naturalH = bitmap.height;
  if (
    naturalW <= 0 ||
    naturalH <= 0 ||
    naturalW > MAX_DIMENSION * 4 ||
    naturalH > MAX_DIMENSION * 4
  ) {
    bitmap.close();
    throw new Error("Image dimensions unsupported");
  }

  const preview = await createImageBitmap(bitmap, {
    resizeWidth: Math.min(naturalW, MAX_DIMENSION),
    resizeHeight: Math.min(naturalH, MAX_DIMENSION),
    resizeQuality: "high",
  });
  bitmap.close();

  const scale = Math.min(1, MAX_PLACE_WIDTH / preview.width);
  const w = Math.max(1, Math.round(preview.width * scale));
  const h = Math.max(1, Math.round(preview.height * scale));

  const off = document.createElement("canvas");
  off.width = preview.width;
  off.height = preview.height;
  const ctx = off.getContext("2d")!;
  ctx.drawImage(preview, 0, 0);
  preview.close();

  // Bake directly into tiles using the snapshot path.
  const r = {
    x: Math.max(0, world.x),
    y: Math.max(0, world.y),
    w: Math.min(TILE, w),
    h: Math.min(TILE, h),
  };
  // Recreate snapshot at world scale: draw the offscreen scaled.
  const snapshot = document.createElement("canvas");
  snapshot.width = Math.max(1, Math.ceil(w));
  snapshot.height = Math.max(1, Math.ceil(h));
  const sctx = snapshot.getContext("2d")!;
  sctx.drawImage(off, 0, 0, snapshot.width, snapshot.height);
  pasteRegion(engine, snapshot, r.x, r.y);
}
