// ============================================================
// Drawva Canvas Engine — Atlas Image Builder for AI Vision
//
// Smart focused local region algorithm:
//   1. Focuses on the user's latest pencil stroke cluster & target widget
//      with comfortable padding (min 800x600) instead of squeezing
//      the entire infinite canvas into tiny unreadable dots.
//   2. Scales up to 2048px for maximum 1:1 high resolution sharpness.
//   3. Preloads HTML/SVG foreignObjects so vision AI sees real live UI components.
// ============================================================

import type { TileMap } from "./tiles";
import type { CanvasItem, Rect } from "./types";
import { computeExportRegion } from "./exportPng";
import { TILE } from "./tiles";
import { drawItems } from "./engine";

/** PenEcho's max atlas side. */
export const ATLAS_MAX_SIDE = 2048;

export interface AtlasOptions {
  /** Override PenEcho's 2048 cap. */
  maxSide?: number;
  /** Bounds of recent pencil strokes drawn by the user */
  recentStrokesBounds?: Rect | null;
  /** Bounds of the target widget being edited / refined */
  widgetBounds?: Rect | null;
  /** Explicit focus region override */
  focusRegion?: Rect | null;
}

export interface AtlasResult {
  dataUrl: string;
  worldRect: Rect;
  scale: number;
  outW: number;
  outH: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
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

/**
 * Focused local atlas builder. Captures the active drawing area / target widget
 * at high 1:1 resolution so handwritten notes and UI components are crystal clear.
 */
export async function buildAtlasImage(
  tiles: TileMap,
  items: CanvasItem[],
  options: AtlasOptions = {}
): Promise<AtlasResult | null> {
  const maxSide = options.maxSide ?? ATLAS_MAX_SIDE;

  // 1. Determine target focused region
  let focus: Rect | null = options.focusRegion || null;

  if (!focus && options.recentStrokesBounds) {
    focus = options.recentStrokesBounds;
    if (options.widgetBounds) {
      focus = unionRect(focus, options.widgetBounds);
    }
  } else if (!focus && options.widgetBounds) {
    focus = options.widgetBounds;
  }

  let region: Rect | null = null;

  if (focus && focus.w > 0 && focus.h > 0) {
    // Pad focused region by 250px so surrounding context & notes are captured cleanly
    const padX = Math.max(250, focus.w * 0.35);
    const padY = Math.max(250, focus.h * 0.35);
    region = {
      x: focus.x - padX,
      y: focus.y - padY,
      w: focus.w + padX * 2,
      h: focus.h + padY * 2,
    };
    // Ensure min dimensions of 800x600 for optimal vision clarity
    if (region.w < 800) {
      const diff = 800 - region.w;
      region.x -= diff / 2;
      region.w = 800;
    }
    if (region.h < 600) {
      const diff = 600 - region.h;
      region.y -= diff / 2;
      region.h = 600;
    }
  } else {
    // Fall back to whole-canvas content region
    region = computeExportRegion(tiles, items);
  }

  if (!region || region.w <= 0 || region.h <= 0) return null;

  const maxDimension = Math.max(region.w, region.h);
  const scale = clamp(maxSide / maxDimension, 0.1, 4);

  const outW = Math.max(1, Math.round(region.w * scale));
  const outH = Math.max(1, Math.round(region.h * scale));

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;

  const ctx = out.getContext("2d");
  if (!ctx) return null;

  // White paper background.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);

  // World → atlas transform.
  ctx.save();
  ctx.translate(-region.x * scale, -region.y * scale);
  ctx.scale(scale, scale);

  // 1) Stroke ink (committed to tiles).
  tiles.forTilesInRect(region, (tile, tx, ty) => {
    ctx.drawImage(tile.canvas, tx * TILE, ty * TILE, TILE, TILE);
  });

  // Preload any widget SVG foreignObject images so they render completely before capturing dataURL
  const loadPromises: Promise<void>[] = [];
  for (const item of items) {
    if (item.kind === "widget") {
      const wi = item as unknown as { w: number; h: number; payload?: string; _preloadedImg?: HTMLImageElement };
      const htmlContent = wi.payload || "";
      if (htmlContent) {
        const sw = Math.max(160, wi.w);
        const sh = Math.max(100, wi.h);
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(sw)}" height="${Math.round(sh)}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;box-sizing:border-box;">
              ${htmlContent}
            </div>
          </foreignObject>
        </svg>`;
        const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);

        loadPromises.push(
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              wi._preloadedImg = img;
              resolve();
            };
            img.onerror = () => resolve();
            img.src = svgUrl;
          })
        );
      }
    }
  }

  if (loadPromises.length > 0) {
    await Promise.all(loadPromises);
  }

  // 2) Items (text / shapes / images / preloaded HTML widgets)
  drawItems(
    ctx,
    items,
    {
      toScreen: (p) => p,
      scale: 1,
    },
    () => {}
  );

  ctx.restore();

  let dataUrl: string;
  try {
    dataUrl = out.toDataURL("image/webp", 0.85);
  } catch {
    dataUrl = out.toDataURL("image/png");
  }

  return { dataUrl, worldRect: region, scale, outW, outH };
}