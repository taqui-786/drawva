// ============================================================
// Drawva Canvas Engine — Shape Tool
// rect / ellipse / arrow: drag preview on interactionLayer,
// commit as ShapeItem on pointerup.
// ============================================================

import type { Camera } from "./camera";
import type { Layers } from "./layers";
import type { ShapeItem } from "./types";

let _nextId = 1;
function newId(): string {
  return `shape_${Date.now()}_${_nextId++}`;
}

export type ShapeType = "rect" | "ellipse" | "arrow" | "line";

export class ShapeTool {
  private drawing = false;
  private activePointerId: number | null = null;
  private startWorld = { x: 0, y: 0 };
  private endWorld = { x: 0, y: 0 };
  private shapeType: ShapeType = "rect";
  private color = "#1a1a1a";
  private strokeWidth = 2;
  private fill = "transparent";

  private camera: Camera;
  private layers: Layers;
  private onCommit: (item: ShapeItem) => void;

  constructor(
    camera: Camera,
    layers: Layers,
    onCommit: (item: ShapeItem) => void
  ) {
    this.camera = camera;
    this.layers = layers;
    this.onCommit = onCommit;
  }

  setShapeType(type: ShapeType): void {
    this.shapeType = type;
  }

  setColor(color: string): void {
    this.color = color;
  }

  setStrokeWidth(w: number): void {
    this.strokeWidth = w;
  }

  setFill(fill: string): void {
    this.fill = fill;
  }

  // ── Pointer events ─────────────────────────────────────

  onPointerDown(e: PointerEvent): void {
    if (this.drawing || e.button !== 0) return;

    this.drawing = true;
    this.activePointerId = e.pointerId;
    this.startWorld = this.camera.screenToWorld({ x: e.offsetX, y: e.offsetY });
    this.endWorld = { ...this.startWorld };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.drawing || e.pointerId !== this.activePointerId) return;
    this.endWorld = this.camera.screenToWorld({ x: e.offsetX, y: e.offsetY });
    this.drawPreview();
  }

  onPointerUp(e: PointerEvent): void {
    if (!this.drawing || e.pointerId !== this.activePointerId) return;
    this.endWorld = this.camera.screenToWorld({ x: e.offsetX, y: e.offsetY });
    this.finishShape();
  }

  onPointerCancel(e: PointerEvent): void {
    if (!this.drawing || e.pointerId !== this.activePointerId) return;
    this.cancel();
  }

  cancel(): void {
    this.drawing = false;
    this.activePointerId = null;
    this.clearPreview();
  }

  // ── Drawing ────────────────────────────────────────────

  private drawPreview(): void {
    const ctx = this.layers.interactionCtx;
    const { dpr, cssWidth: w, cssHeight: h } = this.layers;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const s = this.camera.worldToScreen(this.startWorld);
    const e = this.camera.worldToScreen(this.endWorld);
    const rx = e.x - s.x;
    const ry = e.y - s.y;

    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.strokeWidth * this.camera.scale;
    ctx.fillStyle = this.fill;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (this.shapeType) {
      case "rect": {
        ctx.beginPath();
        ctx.rect(s.x, s.y, rx, ry);
        if (this.fill !== "transparent") ctx.fill();
        ctx.stroke();
        break;
      }
      case "ellipse": {
        ctx.beginPath();
        ctx.ellipse(
          s.x + rx / 2, s.y + ry / 2,
          Math.abs(rx / 2), Math.abs(ry / 2),
          0, 0, Math.PI * 2
        );
        if (this.fill !== "transparent") ctx.fill();
        ctx.stroke();
        break;
      }
      case "arrow":
      case "line": {
        this.drawArrow(ctx, s.x, s.y, e.x, e.y, this.shapeType === "arrow");
        break;
      }
    }

    ctx.restore();
  }

  private drawArrow(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number,
    x2: number, y2: number,
    arrowHead: boolean
  ): void {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (arrowHead) {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const size = Math.max(8, this.strokeWidth * this.camera.scale * 4);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - size * Math.cos(angle - Math.PI / 6),
        y2 - size * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        x2 - size * Math.cos(angle + Math.PI / 6),
        y2 - size * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  private finishShape(): void {
    this.drawing = false;
    this.activePointerId = null;
    this.clearPreview();

    const x = Math.min(this.startWorld.x, this.endWorld.x);
    const y = Math.min(this.startWorld.y, this.endWorld.y);
    const w = Math.abs(this.endWorld.x - this.startWorld.x);
    const h = Math.abs(this.endWorld.y - this.startWorld.y);

    if (w < 2 && h < 2) return; // accidental click

    const isLineOrArrow = this.shapeType === "arrow" || this.shapeType === "line";

    const item: ShapeItem = {
      id: newId(),
      kind: "shape",
      type: this.shapeType,
      x,
      y,
      w,
      h,
      ...(isLineOrArrow
        ? {
            x1: this.startWorld.x,
            y1: this.startWorld.y,
            x2: this.endWorld.x,
            y2: this.endWorld.y,
          }
        : {}),
      color: this.color,
      strokeWidth: this.strokeWidth,
      fill: this.fill,
    };

    this.onCommit(item);
  }

  private clearPreview(): void {
    const ctx = this.layers.interactionCtx;
    const { dpr, cssWidth: w, cssHeight: h } = this.layers;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
  }
}
