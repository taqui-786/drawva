import { CanvasEngine, unionRect } from "./engine";
import { SIZE, TILE } from "./constants";
import type { Point, Rect } from "./types";

/**
 * Low-level stroke raster ops, direct port of penecho persistence.js
 * stroke()/dot()/pressureWidth()/logicalWidth()/drawPreview().
 */

export interface StrokeOptions {
  color: string;
  pen: number; // css width for the pen tool
  eraser: number; // css width for the eraser
  highlighterTop: boolean; // whether highlighter draws alone on a top layer
}

export function strokeSegment(
  engine: CanvasEngine,
  a: Point,
  b: Point,
  opts: { erase: boolean; size: number; color: string; pad?: number }
): void {
  const { erase, size, color } = opts;
  const pad = opts.pad ?? Math.ceil(size) + 2;
  const x = Math.min(a.x, b.x) - pad;
  const y = Math.min(a.y, b.y) - pad;
  const w = Math.abs(a.x - b.x) + pad * 2;
  const h = Math.abs(a.y - b.y) + pad * 2;
  const bounds = { x, y, w, h };

  const x0 = Math.max(0, Math.floor(x / TILE));
  const y0 = Math.max(0, Math.floor(y / TILE));
  const x1 = Math.min(Math.ceil(SIZE / TILE) - 1, Math.floor((x + w) / TILE));
  const y1 = Math.min(Math.ceil(SIZE / TILE) - 1, Math.floor((y + h) / TILE));

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      // Segment vs tile-intersection quick reject (aabb overlap of the stroke box).
      const tileBox = {
        x: tx * TILE - pad,
        y: ty * TILE - pad,
        w: TILE + pad * 2,
        h: TILE + pad * 2,
      };
      if (!segmentBoxIntersects(a, b, tileBox)) continue;

      const existing = engine.tiles.get(tx, ty);
      if (erase && !existing) continue;
      engine.noteTileWrite(tx, ty);
      const c = existing ?? engine.tiles.tile(tx, ty)!;
      const q = c.getContext("2d")!;
      q.save();
      q.globalCompositeOperation = erase ? "destination-out" : "source-over";
      q.strokeStyle = color;
      q.lineWidth = size;
      q.lineCap = "round";
      q.lineJoin = "round";
      q.beginPath();
      q.moveTo(a.x - tx * TILE, a.y - ty * TILE);
      q.lineTo(b.x - tx * TILE, b.y - ty * TILE);
      q.stroke();
      q.restore();
    }
  }

  markDirty(engine, a, pad);
  markDirty(engine, b, pad);
  engine.onStrokeSegment?.(a, b, { erase, size, color });
  void bounds;
}

export function dotStroke(
  engine: CanvasEngine,
  p: Point,
  opts: { erase: boolean; size: number; color: string }
): void {
  strokeSegment(engine, p, { x: p.x + 0.01, y: p.y + 0.01 }, opts);
}

function markDirty(engine: CanvasEngine, p: Point, pad: number): void {
  engine.requestRender();
  void p;
  void pad;
}

export function pressureWidth(pen: number, e: { pointerType: string; pressure: number }): number {
  if (e.pointerType !== "pen" || !Number.isFinite(e.pressure) || e.pressure <= 0) return pen;
  return Math.max(3, Math.min(16, pen * (0.72 + e.pressure * 0.7)));
}

export function logicalWidth(cssWidth: number, scale: number, erasing = false): number {
  const maximum = erasing ? 1600 : 320;
  return Math.max(1, Math.min(maximum, cssWidth / Math.max(0.03, scale)));
}

export function drawPreviewSegment(
  engine: CanvasEngine,
  s: { a: Point; b: Point; size: number; erase: boolean; color: string }
): void {
  const ctx = engine.ctx("interaction");
  ctx.strokeStyle = s.erase ? "#dc262666" : `${s.color}88`;
  ctx.lineWidth = s.size;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s.a.x, s.a.y);
  ctx.lineTo(s.b.x, s.b.y);
  ctx.stroke();
}

function segmentBoxIntersects(a: Point, b: Point, box: { x: number; y: number; w: number; h: number }): boolean {
  if (Math.min(a.x, b.x) > box.x + box.w) return false;
  if (Math.max(a.x, b.x) < box.x) return false;
  if (Math.min(a.y, b.y) > box.y + box.h) return false;
  if (Math.max(a.y, b.y) < box.y) return false;
  return true;
}

/**
 * Live pen / eraser / highlighter gesture controller.
 * Matches penecho's drawing state machine: pointerdown dots, pointermove strokes
 * a->p, pointerup finalizes. Pen strokes paint directly into the tiles; the
 * eraser also paints (destination-out) and shows a cursor preview on the
 * interaction layer.
 */
export class StrokeController {
  private active: {
    id: number;
    last: Point;
    erase: boolean;
    size: number;
    color: string;
  } | null = null;
  private eraserPreview: { point: Point; size: number } | null = null;

  constructor(
    private engine: CanvasEngine,
    private opts: () => StrokeOptions
  ) {
    // Live eraser cursor rendered each frame (survives pan/zoom).
    engine.onInteractionFrame((ctx) => {
      if (!this.eraserPreview) return;
      ctx.beginPath();
      ctx.arc(this.eraserPreview.point.x, this.eraserPreview.point.y, this.eraserPreview.size / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#dc262644";
      ctx.fill();
    });
  }

  get drawing(): boolean {
    return this.active !== null;
  }

  begin(
    pointerId: number,
    world: Point,
    pressure: number,
    mode: "pen" | "highlighter" | "eraser"
  ): void {
    const o = this.opts();
    const erasing = mode === "eraser";
    const cssWidth = erasing ? o.eraser : o.pen;
    const size = logicalWidth(
      cssWidth * (mode === "highlighter" ? 2.2 : 1),
      this.engine.camera.scale,
      erasing
    );
    this.active = {
      id: pointerId,
      last: world,
      erase: erasing,
      size,
      color: mode === "highlighter" ? "#fbbf2473" : o.color,
    };
    if (erasing) {
      this.eraserPreview = { point: world, size };
      this.engine.requestInteractionRender(eraserRect(world, size));
    }
    dotStroke(this.engine, world, { erase: erasing, size, color: this.active.color });
  }

  move(pointerId: number, world: Point, pressure: number): void {
    const d = this.active;
    if (!d || d.id !== pointerId) return;
    void pressure;
    const o = this.opts();
    const erasing = d.erase;
    const cssWidth = erasing ? o.eraser : o.pen;
    const size = logicalWidth(cssWidth, this.engine.camera.scale, erasing);
    strokeSegment(this.engine, d.last, world, { erase: erasing, size, color: d.color });
    d.last = world;
    d.size = size;
    if (erasing) {
      const prev = this.eraserPreview;
      const r = prev
        ? unionRect(eraserRect(prev.point, prev.size), eraserRect(world, size))
        : eraserRect(world, size);
      this.eraserPreview = { point: world, size };
      this.engine.requestInteractionRender(r);
    }
  }

  end(pointerId: number): void {
    if (this.active?.id === pointerId) {
      this.active = null;
      const prev = this.eraserPreview;
      if (prev) {
        this.eraserPreview = null;
        this.engine.requestInteractionRender(eraserRect(prev.point, prev.size));
      }
    }
  }
}

function eraserRect(p: Point, size: number): Rect {
  const r = size / 2 + 2;
  return { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 };
}
