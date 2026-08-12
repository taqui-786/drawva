import { CanvasEngine } from "./engine";
import { TILE } from "./constants";
import type { Point } from "./types";

export interface TextStyle {
  color: string;
  fontSize: number; // world units
  maxWidth: number; // world units
}

const FONT_FAMILY = "ui-rounded, system-ui, sans-serif";

/** Lay out multi-line text and paint it onto a standalone canvas (no tiles).
 * Returns the bitmap plus its logical world size. Penecho's logicalWidth()/
 * logicalHeight() equivalent — used to build living text attachments.
 */
export function renderTextBlock(
  text: string,
  color: string,
  fontSize: number,
  maxWidth: number
): { canvas: HTMLCanvasElement; w: number; h: number } {
  const off = document.createElement("canvas");
  const ctx = off.getContext("2d")!;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(trial).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = trial;
  }
  if (cur) lines.push(cur);
  const lineHeight = fontSize * 1.35;
  const w = Math.max(1, Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))));
  const h = Math.max(1, Math.ceil(lines.length * lineHeight));

  off.width = w;
  off.height = h;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, 0, i * lineHeight));
  return { canvas: off, w, h };
}

/**
 * Rasterize multi-line text into the ink tiles, wrapping at maxWidth. Direct
 * equivalent of penecho's textImage() drawn into a tile region.
 */
export function rasterizeText(
  engine: CanvasEngine,
  text: string,
  anchor: Point,
  style: TextStyle
): void {
  const { color, fontSize, maxWidth } = style;
  if (!text.trim()) return;

  const off = document.createElement("canvas");
  const ctx = off.getContext("2d")!;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;

  const lines: string[] = [];
  const words = text.split(/\s+/);
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(trial).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = trial;
  }
  if (cur) lines.push(cur);

  const lineHeight = fontSize * 1.35;
  const w = Math.ceil(maxWidth);
  const h = Math.ceil(lines.length * lineHeight);
  off.width = Math.min(w, TILE);
  off.height = Math.min(h, TILE);
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, 0, i * lineHeight));

  const pad = 2;
  const x0 = Math.max(0, Math.floor(anchor.x / TILE));
  const y0 = Math.max(0, Math.floor(anchor.y / TILE));
  const x1 = Math.max(x0, Math.floor((anchor.x + w) / TILE));
  const y1 = Math.max(y0, Math.floor((anchor.y + h) / TILE));

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      engine.noteTileWrite(tx, ty);
      const c = engine.tiles.tile(tx, ty)!;
      const q = c.getContext("2d")!;
      const srcX = Math.max(0, tx * TILE - anchor.x) - pad;
      const srcY = Math.max(0, ty * TILE - anchor.y) - pad;
      const dstX = Math.max(0, anchor.x - tx * TILE) + pad;
      const dstY = Math.max(0, anchor.y - ty * TILE) + pad;
      q.drawImage(off, srcX, srcY, off.width - srcX, off.height - srcY, dstX, dstY, off.width - srcX, off.height - srcY);
    }
  }
  engine.requestRender();
}
