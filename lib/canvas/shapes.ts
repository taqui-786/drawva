import { CanvasEngine, unionRect } from "./engine";
import { strokeSegment } from "./strokes";
import type { Point, Rect } from "./types";

export type ShapeKind = "rect" | "ellipse" | "arrow" | "line";

export interface ShapeStyle {
  color: string;
  lineWidth: number;
}

export interface ShapePrimitive {
  kind: ShapeKind;
  from: Point;
  to: Point;
}

export class ShapeController {
  private active: {
    id: number;
    start: Point;
    current: Point;
    kind: ShapeKind;
    style: ShapeStyle;
  } | null = null;

  constructor(
    private engine: CanvasEngine,
    style: { readonly color: string; readonly lineWidth: number }
  ) {
    this.styleGet = style;
    engine.onInteractionFrame((ctx) => {
      if (!this.active) return;
      ctx.strokeStyle = this.active.style.color;
      ctx.lineWidth = this.active.style.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const a = this.active.start;
      const b = this.active.current;
      switch (this.active.kind) {
        case "rect":
          ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
          break;
        case "ellipse":
          ctx.ellipse(
            (a.x + b.x) / 2,
            (a.y + b.y) / 2,
            Math.abs(b.x - a.x) / 2,
            Math.abs(b.y - a.y) / 2,
            0,
            0,
            Math.PI * 2
          );
          break;
        case "arrow":
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          drawArrowhead(ctx, a, b, this.active.style.lineWidth);
          break;
        case "line":
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          break;
      }
      ctx.stroke();
    });
  }

  private styleGet: { readonly color: string; readonly lineWidth: number };

  begin(pointerId: number, world: Point, kind: ShapeKind): void {
    this.active = {
      id: pointerId,
      start: world,
      current: world,
      kind,
      style: { color: this.styleGet.color, lineWidth: this.styleGet.lineWidth },
    };
    this.engine.requestInteractionRender(
      previewRect(world, world, this.styleGet.lineWidth)
    );
  }

  move(pointerId: number, world: Point): void {
    if (!this.active || this.active.id !== pointerId) return;
    const d = this.active;
    const prev = d.current;
    d.current = world;
    this.engine.requestInteractionRender(
      unionRect(
        previewRect(d.start, prev, d.style.lineWidth),
        previewRect(d.start, world, d.style.lineWidth)
      )
    );
  }

  end(pointerId: number): void {
    const d = this.active;
    if (!d || d.id !== pointerId) return;
    this.active = null;
    this.engine.requestInteractionRender(
      previewRect(d.start, d.current, d.style.lineWidth)
    );
    rasterize(this.engine, d.start, d.current, d.kind, d.style);
  }

  cancel(): void {
    const d = this.active;
    if (!d) return;
    this.active = null;
    this.engine.requestInteractionRender(
      previewRect(d.start, d.current, d.style.lineWidth)
    );
  }

  get isDrawing(): boolean {
    return this.active !== null;
  }
}

function previewRect(a: Point, b: Point, lineWidth: number): Rect {
  const pad = lineWidth / 2 + 4;
  return {
    x: Math.min(a.x, b.x) - pad,
    y: Math.min(a.y, b.y) - pad,
    w: Math.abs(b.x - a.x) + pad * 2,
    h: Math.abs(b.y - a.y) + pad * 2,
  };
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  width: number
): void {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const len = Math.min(width * 4, Math.hypot(b.x - a.x, b.y - a.y) * 0.4);
  const head = 0.5;
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - len * Math.cos(angle - head), b.y - len * Math.sin(angle - head));
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - len * Math.cos(angle + head), b.y - len * Math.sin(angle + head));
}

function rasterize(
  engine: CanvasEngine,
  a: Point,
  b: Point,
  kind: ShapeKind,
  style: ShapeStyle
): void {
  switch (kind) {
    case "rect": {
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      strokeSegment(engine, { x, y }, { x, y: y + h }, { erase: false, size: style.lineWidth, color: style.color });
      strokeSegment(engine, { x: x + w, y }, { x: x + w, y: y + h }, { erase: false, size: style.lineWidth, color: style.color });
      strokeSegment(engine, { x, y }, { x: x + w, y }, { erase: false, size: style.lineWidth, color: style.color });
      strokeSegment(engine, { x, y: y + h }, { x: x + w, y: y + h }, { erase: false, size: style.lineWidth, color: style.color });
      return;
    }
    case "line":
      strokeSegment(engine, a, b, { erase: false, size: style.lineWidth, color: style.color });
      return;
    case "arrow":
      strokeSegment(engine, a, b, { erase: false, size: style.lineWidth, color: style.color });
      rasterizeArrowhead(engine, a, b, style);
      return;
    case "ellipse": {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      if (rx <= 0 || ry <= 0) return;
      const steps = Math.max(16, Math.floor((rx + ry) * 0.1));
      let prev: Point = { x: cx + rx, y: cy };
      for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const p: Point = { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
        strokeSegment(engine, prev, p, { erase: false, size: style.lineWidth, color: style.color });
        prev = p;
      }
      return;
    }
  }
}

function rasterizeArrowhead(
  engine: CanvasEngine,
  a: Point,
  b: Point,
  style: ShapeStyle
): void {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const total = Math.hypot(b.x - a.x, b.y - a.y);
  const len = Math.min(style.lineWidth * 4, total * 0.4);
  const head = 0.5;
  strokeSegment(engine, b, { x: b.x - len * Math.cos(angle - head), y: b.y - len * Math.sin(angle - head) }, { erase: false, size: style.lineWidth, color: style.color });
  strokeSegment(engine, b, { x: b.x - len * Math.cos(angle + head), y: b.y - len * Math.sin(angle + head) }, { erase: false, size: style.lineWidth, color: style.color });
}
