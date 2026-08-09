// ============================================================
// Drawva Canvas Engine — PNG Export
// Exports the used region (inkBounds union + items bounds)
// padded by 1 tile. Chunks if > 4096px. Offers download + clipboard.
// ============================================================

import type { TileMap } from "./tiles";
import type { CanvasItem, Rect } from "./types";
import { TILE } from "./tiles";

const MAX_EXPORT_DIM = 4096;
const EXPORT_TILE_PAD = 1; // tile-units of padding around content

export interface ExportOptions {
  region?: Rect; // world coords; auto-computed from inkBounds if omitted
  scale?: number; // output pixels per world unit (default 1)
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

function itemBounds(item: CanvasItem): Rect | null {
  if ("x" in item && "w" in item) {
    return { x: item.x as number, y: item.y as number, w: item.w as number, h: item.h as number };
  }
  return null;
}

/** Compute the world-space export region */
export function computeExportRegion(tiles: TileMap, items: CanvasItem[]): Rect | null {
  let region: Rect | null = tiles.globalInkBounds();

  for (const item of items) {
    const b = itemBounds(item);
    if (!b) continue;
    region = region ? unionRect(region, b) : b;
  }

  if (!region) return null;

  // Pad by 1 tile on each side
  const pad = TILE * EXPORT_TILE_PAD;
  return {
    x: region.x - pad,
    y: region.y - pad,
    w: region.w + pad * 2,
    h: region.h + pad * 2,
  };
}

/**
 * Render a world-space region from tiles onto an offscreen canvas.
 * Returns the canvas (may be downscaled if region > MAX_EXPORT_DIM).
 */
async function renderRegion(
  tiles: TileMap,
  worldRect: Rect,
  scale: number
): Promise<HTMLCanvasElement> {
  let outW = Math.round(worldRect.w * scale);
  let outH = Math.round(worldRect.h * scale);

  // Clamp to browser limits
  const maxDim = MAX_EXPORT_DIM;
  if (outW > maxDim || outH > maxDim) {
    const ratio = Math.min(maxDim / outW, maxDim / outH);
    outW = Math.round(outW * ratio);
    outH = Math.round(outH * ratio);
    scale = scale * ratio;
  }

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d")!;
  ctx.clearRect(0, 0, outW, outH);

  // Draw white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);

  // Apply transform: world → export canvas
  ctx.save();
  ctx.translate(-worldRect.x * scale, -worldRect.y * scale);
  ctx.scale(scale, scale);

  // Draw tiles
  tiles.forTilesInRect(worldRect, (tile, tx, ty) => {
    ctx.drawImage(tile.canvas, tx * TILE, ty * TILE, TILE, TILE);
  });

  ctx.restore();
  return out;
}

/** Export and download as PNG */
export async function exportPng(
  tiles: TileMap,
  items: CanvasItem[],
  options: ExportOptions = {}
): Promise<void> {
  const region = options.region ?? computeExportRegion(tiles, items);
  if (!region) {
    alert("Nothing to export — canvas is empty.");
    return;
  }

  const scale = options.scale ?? 1;
  const canvas = await renderRegion(tiles, region, scale);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `drawva-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Copy export to clipboard */
export async function copyToClipboard(
  tiles: TileMap,
  items: CanvasItem[],
  options: ExportOptions = {}
): Promise<boolean> {
  if (!navigator.clipboard?.write) return false;

  const region = options.region ?? computeExportRegion(tiles, items);
  if (!region) return false;

  const canvas = await renderRegion(tiles, region, options.scale ?? 1);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) return false;

  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    return true;
  } catch (err) {
    console.warn("[Export] Clipboard write failed:", err);
    return false;
  }
}

/** Generate a small preview thumbnail */
export async function generatePreview(
  tiles: TileMap,
  items: CanvasItem[]
): Promise<string | null> {
  const region = computeExportRegion(tiles, items);
  if (!region) return null;

  const THUMB_MAX = 256;
  const scale = Math.min(THUMB_MAX / region.w, THUMB_MAX / region.h, 1);
  const canvas = await renderRegion(tiles, region, scale);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      0.7
    );
  });
}
