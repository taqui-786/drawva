// ============================================================
// Drawva Canvas Engine — Atlas Image Builder for AI Vision
// Rasterizes visible/ink region into a base64 data URL + world rect
// Specified in public/canvas-build-plan/07-AI-LANGCHAIN-MIMO.md §3
// ============================================================

import type { TileMap } from "./tiles";
import type { CanvasItem, Rect } from "./types";
import { computeExportRegion } from "./exportPng";
import { TILE } from "./tiles";

export interface AtlasResult {
  dataUrl: string;
  worldRect: Rect;
  scale: number;
}

export function buildAtlasImage(
  tiles: TileMap,
  items: CanvasItem[],
  maxSide = 2048
): AtlasResult | null {
  const region = computeExportRegion(tiles, items);
  if (!region || region.w <= 0 || region.h <= 0) return null;

  const maxDimension = Math.max(region.w, region.h);
  const rawScale = maxSide / maxDimension;
  const scale = Math.min(Math.max(rawScale, 0.1), 4);

  const outW = Math.max(1, Math.round(region.w * scale));
  const outH = Math.max(1, Math.round(region.h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);

  // Transform world -> atlas canvas
  ctx.save();
  ctx.translate(-region.x * scale, -region.y * scale);
  ctx.scale(scale, scale);

  // Draw tile ink
  tiles.forTilesInRect(region, (tile, tx, ty) => {
    ctx.drawImage(tile.canvas, tx * TILE, ty * TILE, TILE, TILE);
  });

  ctx.restore();

  try {
    const dataUrl = canvas.toDataURL("image/webp", 0.85);
    return { dataUrl, worldRect: region, scale };
  } catch {
    // Fallback to PNG if webp is unsupported
    const dataUrl = canvas.toDataURL("image/png");
    return { dataUrl, worldRect: region, scale };
  }
}
