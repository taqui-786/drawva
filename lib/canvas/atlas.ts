import { CanvasEngine } from "./engine";
import { TILE } from "./constants";
import type { Rect } from "./types";

const MAX_ATLAS_WIDTH = 2048;
const MAX_ATLAS_HEIGHT = 1536;

export interface AtlasResult {
  atlasImage: string; // WebP data URL
  imageSize: { w: number; h: number };
  visibleRect: Rect;
  sourceRect: Rect;
  changedBox: Rect;
  imageScale: number;
}

/**
 * Build the AI-visible image from the current viewport: white background, then
 * the ink tiles packed in, scaled to ≤2048px, exported as a WebP data URL.
 * Port of penecho buildAtlas(). `changedBox` highlights the latest user ink
 * (drawn at full opacity) over a dimmed context.
 */
export function buildAtlas(
  engine: CanvasEngine,
  viewport: Rect,
  changedBox: Rect | null,
  includeWidgetTiles = false
): AtlasResult {
  const sourceRect = clip(viewport);
  const scale = Math.min(
    1,
    MAX_ATLAS_WIDTH / sourceRect.w,
    MAX_ATLAS_HEIGHT / sourceRect.h
  );
  const outW = Math.max(1, Math.min(MAX_ATLAS_WIDTH, Math.ceil(sourceRect.w * scale)));
  const outH = Math.max(1, Math.min(MAX_ATLAS_HEIGHT, Math.ceil(sourceRect.h * scale)));
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const q = out.getContext("2d")!;

  q.fillStyle = "#fff";
  q.fillRect(0, 0, out.width, out.height);
  q.setTransform(scale, 0, 0, scale, -sourceRect.x * scale, -sourceRect.y * scale);

  // Dim context for everything outside the changed box.
  q.save();
  if (changedBox) q.globalAlpha = 0.42;
  drawTiles(engine, q, sourceRect);
  q.restore();

  if (changedBox) {
    const visible = clip(intersect(changedBox, sourceRect));
    if (visible.w > 0 && visible.h > 0) {
      q.save();
      q.beginPath();
      q.rect(visible.x, visible.y, visible.w, visible.h);
      q.clip();
      drawTiles(engine, q, visible);
      q.restore();
    }
  }
  q.setTransform(1, 0, 0, 1, 0, 0);

  const data = out.toDataURL(includeWidgetTiles ? "image/png" : "image/webp", 0.9);
  return {
    atlasImage: data,
    imageSize: { w: outW, h: outH },
    visibleRect: { ...viewport },
    sourceRect,
    changedBox: changedBox ? clip(intersect(changedBox, sourceRect)) : { x: 0, y: 0, w: 0, h: 0 },
    imageScale: scale,
  };
}

function drawTiles(engine: CanvasEngine, q: CanvasRenderingContext2D, rect: Rect): void {
  const x0 = Math.max(0, Math.floor(rect.x / TILE));
  const y0 = Math.max(0, Math.floor(rect.y / TILE));
  const x1 = Math.max(x0, Math.floor((rect.x + rect.w) / TILE));
  const y1 = Math.max(y0, Math.floor((rect.y + rect.h) / TILE));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const c = engine.tiles.get(tx, ty);
      if (c) q.drawImage(c, tx * TILE, ty * TILE);
    }
  }
}

function clip(r: Rect): Rect {
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.max(0, Math.round(r.w)),
    h: Math.max(0, Math.round(r.h)),
  };
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
    h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
  };
}

/**
 * Create a 2x magnified WebP image crop of the user's latest handwriting region
 * (changedBox) to assist the vision model with character-level OCR & math recognition.
 */
export function buildFocusInset(engine: CanvasEngine, changedBox: Rect | null): string | undefined {
  if (!changedBox || changedBox.w <= 0 || changedBox.h <= 0) return undefined;
  if (changedBox.w > 600 || changedBox.h > 600) return undefined;

  const pad = 32;
  const box = clip({
    x: changedBox.x - pad,
    y: changedBox.y - pad,
    w: changedBox.w + pad * 2,
    h: changedBox.h + pad * 2,
  });

  const out = document.createElement("canvas");
  const scale = 2;
  out.width = Math.max(1, Math.ceil(box.w * scale));
  out.height = Math.max(1, Math.ceil(box.h * scale));
  const q = out.getContext("2d");
  if (!q) return undefined;

  q.fillStyle = "#ffffff";
  q.fillRect(0, 0, out.width, out.height);
  q.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
  drawTiles(engine, q, box);
  q.setTransform(1, 0, 0, 1, 0, 0);

  return out.toDataURL("image/webp", 0.95);
}
