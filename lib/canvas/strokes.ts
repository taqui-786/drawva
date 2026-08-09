// ============================================================
// Drawva Canvas Engine — Stroke Tool (Pen + Highlighter)
// Pointer events on interactionLayer. Live preview on inkLayer.
// On pointerup: commit to tiles, push undo, clear inkLayer.
// ============================================================

import type { StrokePoint, ToolName, Rect } from "./types";
import type { Camera } from "./camera";
import type { TileMap } from "./tiles";
import type { Layers } from "./layers";
import type { UndoStack } from "./undo";
import { TILE } from "./tiles";

/** Minimum distance (world px) between stroke points during decimation */
const MIN_DIST = 0.5;
/** Maximum stored points before decimation */
const MAX_POINTS = 10_000;

function dist(a: StrokePoint, b: StrokePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Thin points below minimum distance threshold without losing shape */
function decimatePoints(pts: StrokePoint[]): StrokePoint[] {
  if (pts.length <= 2) return pts;
  const out: StrokePoint[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    if (dist(out[out.length - 1], pts[i]) >= MIN_DIST) {
      out.push(pts[i]);
    }
  }
  if (dist(out[out.length - 1], pts[pts.length - 1]) > 0.1) {
    out.push(pts[pts.length - 1]);
  }
  return out;
}

export class StrokeTool {
  private drawing = false;
  private points: StrokePoint[] = [];
  private activePointerId: number | null = null;
  private color = "#1a1a1a";
  private baseSize = 3;
  private opacity = 1;
  private tool: Extract<ToolName, "pen" | "highlighter"> = "pen";

  private camera: Camera;
  private tiles: TileMap;
  private layers: Layers;
  private undoStack: UndoStack;
  private requestRender: () => void;
  private onCommit: () => void;

  constructor(
    camera: Camera,
    tiles: TileMap,
    layers: Layers,
    undoStack: UndoStack,
    requestRender: () => void,
    onCommit: () => void
  ) {
    this.camera = camera;
    this.tiles = tiles;
    this.layers = layers;
    this.undoStack = undoStack;
    this.requestRender = requestRender;
    this.onCommit = onCommit;
  }

  setTool(tool: Extract<ToolName, "pen" | "highlighter">): void {
    this.tool = tool;
  }

  setColor(color: string): void {
    this.color = color;
  }

  setSize(size: number): void {
    this.baseSize = size;
  }

  // ── Pointer event handlers ─────────────────────────────

  onPointerDown(e: PointerEvent): void {
    if (this.drawing || e.button !== 0) return;

    this.drawing = true;
    this.activePointerId = e.pointerId;
    this.points = [];

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore if capture not supported */
    }

    const world = this.camera.screenToWorld({ x: e.offsetX, y: e.offsetY });
    this.points.push({ ...world, pressure: e.pressure > 0 ? e.pressure : 0.5 });

    this.drawLiveStroke();
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.drawing || e.pointerId !== this.activePointerId) return;

    const coalesced = e.getCoalescedEvents?.() ?? [];
    if (coalesced.length > 0) {
      for (const ce of coalesced) {
        const cworld = this.camera.screenToWorld({ x: ce.offsetX, y: ce.offsetY });
        this.points.push({ ...cworld, pressure: ce.pressure > 0 ? ce.pressure : 0.5 });
      }
    } else {
      const world = this.camera.screenToWorld({ x: e.offsetX, y: e.offsetY });
      this.points.push({ ...world, pressure: e.pressure > 0 ? e.pressure : 0.5 });
    }

    if (this.points.length > MAX_POINTS) {
      this.points = decimatePoints(this.points);
    }

    this.drawLiveStroke();
  }

  onPointerUp(e: PointerEvent): void {
    if (!this.drawing || e.pointerId !== this.activePointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.finishStroke();
  }

  onPointerCancel(e: PointerEvent): void {
    if (!this.drawing || e.pointerId !== this.activePointerId) return;
    this.cancel();
  }

  cancel(): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.activePointerId = null;
    this.points = [];
    this.clearInkLayer();
  }

  // ── Drawing live preview ───────────────────────────────

  private drawLiveStroke(): void {
    const ctx = this.layers.inkCtx;
    const dpr = this.layers.dpr;
    const { cssWidth: w, cssHeight: h } = this.layers;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    this.applyStrokeStyle(ctx);
    this.drawPoints(ctx, this.points);

    ctx.restore();
  }

  private applyStrokeStyle(ctx: CanvasRenderingContext2D): void {
    const isHighlighter = this.tool === "highlighter";
    ctx.globalAlpha = isHighlighter ? 0.35 : this.opacity;
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  private drawPoints(ctx: CanvasRenderingContext2D, pts: StrokePoint[]): void {
    if (pts.length === 0) return;

    const toScreen = (p: StrokePoint) => {
      const s = this.camera.worldToScreen(p);
      const width = (this.baseSize * this.camera.scale) * (0.4 + p.pressure * 0.6);
      return { x: s.x, y: s.y, width };
    };

    if (pts.length === 1) {
      const s = toScreen(pts[0]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1, s.width / 2), 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const screenPts = pts.map(toScreen);

    for (let i = 0; i < screenPts.length - 1; i++) {
      const a = screenPts[i];
      const b = screenPts[i + 1];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;

      ctx.lineWidth = Math.max(1, (a.width + b.width) / 2);
      ctx.beginPath();
      if (i === 0) {
        ctx.moveTo(a.x, a.y);
      } else {
        const prevMidX = (screenPts[i - 1].x + a.x) / 2;
        const prevMidY = (screenPts[i - 1].y + a.y) / 2;
        ctx.moveTo(prevMidX, prevMidY);
      }
      ctx.quadraticCurveTo(a.x, a.y, midX, midY);
      ctx.stroke();
    }

    // Connect last midpoint to end
    if (screenPts.length > 1) {
      const last = screenPts[screenPts.length - 1];
      const prev = screenPts[screenPts.length - 2];
      const prevMidX = (prev.x + last.x) / 2;
      const prevMidY = (prev.y + last.y) / 2;

      ctx.lineWidth = Math.max(1, last.width);
      ctx.beginPath();
      ctx.moveTo(prevMidX, prevMidY);
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
  }

  // ── Commit to tiles ────────────────────────────────────

  private finishStroke(): void {
    this.drawing = false;
    this.activePointerId = null;

    const pts = decimatePoints(this.points);
    if (pts.length === 0) {
      this.clearInkLayer();
      return;
    }

    const strokeRect = this.strokeBounds(pts);
    const tilesBefore = this.tiles.snapshotRect(strokeRect);

    // Commit stroke to tiles
    this.tiles.forTilesInRect(
      strokeRect,
      (tile, tx, ty) => {
        const ctx = tile.ctx;
        ctx.save();

        // Tile clip
        ctx.beginPath();
        ctx.rect(0, 0, TILE, TILE);
        ctx.clip();

        // Translate world -> tile-local
        ctx.translate(-tx * TILE, -ty * TILE);

        this.applyStrokeStyle(ctx);
        this.drawPointsOnTile(ctx, pts);

        ctx.restore();
        tile.dirty = true;
      },
      true /* create */
    );

    const tilesAfter = this.tiles.snapshotRect(strokeRect);

    // Update ink bounds
    this.tiles.forTilesInRect(
      strokeRect,
      (_, tx, ty) => {
        this.tiles.updateInkBounds(tx, ty);
      },
      false
    );

    const byteSize = tilesBefore.reduce((a, t) => a + t.data.data.byteLength, 0);
    this.undoStack.push({
      tilesBefore,
      tilesAfter,
      itemsBefore: [],
      itemsAfter: [],
      byteSize,
    });

    this.clearInkLayer();
    this.points = [];

    this.requestRender();
    this.onCommit();
  }

  private drawPointsOnTile(ctx: CanvasRenderingContext2D, pts: StrokePoint[]): void {
    if (pts.length === 1) {
      const width = this.baseSize * (0.4 + pts[0].pressure * 0.6);
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, Math.max(1, width / 2), 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const width = this.baseSize * (0.4 + ((a.pressure + b.pressure) / 2) * 0.6);

      ctx.lineWidth = Math.max(1, width);
      ctx.beginPath();
      if (i === 0) {
        ctx.moveTo(a.x, a.y);
      } else {
        const prevMidX = (pts[i - 1].x + a.x) / 2;
        const prevMidY = (pts[i - 1].y + a.y) / 2;
        ctx.moveTo(prevMidX, prevMidY);
      }
      ctx.quadraticCurveTo(a.x, a.y, midX, midY);
      ctx.stroke();
    }

    if (pts.length > 1) {
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const prevMidX = (prev.x + last.x) / 2;
      const prevMidY = (prev.y + last.y) / 2;
      const width = this.baseSize * (0.4 + last.pressure * 0.6);

      ctx.lineWidth = Math.max(1, width);
      ctx.beginPath();
      ctx.moveTo(prevMidX, prevMidY);
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
  }

  private strokeBounds(pts: StrokePoint[]): Rect {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = Math.max(20, this.baseSize * 4);
    return {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    };
  }

  private clearInkLayer(): void {
    const ctx = this.layers.inkCtx;
    const { cssWidth: w, cssHeight: h, dpr } = this.layers;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
  }
}
