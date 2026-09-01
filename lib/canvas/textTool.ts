import { CanvasEngine } from "./engine";
import { TILE } from "./constants";
import type { Point } from "./types";

export interface TextStyle {
  color: string;
  fontSize: number;
  maxWidth: number;
}

const FONT_FAMILY = "ui-rounded, system-ui, sans-serif";

export function layoutTextLines(
  text: string,
  ctx: CanvasRenderingContext2D,
  maxWidth: number
): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/[ \t]+/);
    let cur = "";
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(trial).width > maxWidth && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = trial;
      }
    }
    if (cur) lines.push(cur);
  }

  return lines;
}

export function renderTextBlock(
  text: string,
  color: string,
  fontSize: number,
  maxWidth: number,
  lineHeightMultiplier = 1.35
): { canvas: HTMLCanvasElement; w: number; h: number } {
  const off = document.createElement("canvas");
  const ctx = off.getContext("2d")!;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;

  const lines = layoutTextLines(text, ctx, maxWidth);
  const effectiveMultiplier = Number.isFinite(lineHeightMultiplier) && lineHeightMultiplier >= 1 ? lineHeightMultiplier : 1.35;
  const lineHeight = fontSize * effectiveMultiplier;
  const lineWidths = lines.map((l) => (l ? ctx.measureText(l).width : 0));
  const w = Math.max(1, Math.ceil(Math.max(0, ...lineWidths)));
  const h = Math.max(1, Math.ceil(Math.max(1, lines.length) * lineHeight));

  off.width = w;
  off.height = h;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    if (line) ctx.fillText(line, 0, i * lineHeight);
  });
  return { canvas: off, w, h };
}

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

  const lines = layoutTextLines(text, ctx, maxWidth);
  const lineHeight = fontSize * 1.35;
  const lineWidths = lines.map((l) => (l ? ctx.measureText(l).width : 0));
  const w = Math.max(1, Math.ceil(Math.max(maxWidth, ...lineWidths)));
  const h = Math.max(1, Math.ceil(lines.length * lineHeight));
  off.width = Math.min(w, TILE * 4);
  off.height = Math.min(h, TILE * 4);
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    if (line) ctx.fillText(line, 0, i * lineHeight);
  });

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
