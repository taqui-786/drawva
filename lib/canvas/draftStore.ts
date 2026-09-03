import type { CanvasEngine } from "./engine";
import type { CanvasCommand, DrawPoint } from "./commands";
import { eraseRegion } from "./selection";
import { strokeSegment } from "./strokes";
import type { Rect } from "./types";

export type RenderCommand = (
  engine: CanvasEngine,
  command: CanvasCommand
) => Promise<void> | void;

export type DraftInkListener = (op: { kind: "erase"; rect: Rect }) => void;

export class DraftManager {
  private pending: CanvasCommand[] = [];
  private renderers = new Map<string, RenderCommand>();
  private inkListener: DraftInkListener | null = null;

  setRenderer(tool: string, fn: RenderCommand): void {
    this.renderers.set(tool, fn);
  }

  /** Fires for AI/draft rect erases that do not go through the stroke segment hook. */
  setInkListener(fn: DraftInkListener | null): void {
    this.inkListener = fn;
  }

  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  getPending(): CanvasCommand[] {
    return this.pending;
  }

  setPending(commands: CanvasCommand[]): void {
    this.pending = commands;
  }

  discard(): void {
    this.pending = [];
  }

  async accept(engine: CanvasEngine): Promise<number> {
    let applied = 0;
    try {
      for (const c of this.pending) {
        const ok = await this.apply(engine, c);
        if (ok) applied++;
      }
    } finally {
      // Always clear pending: a throwing renderer must never wedge
      // hasPending → isCanvasBusy → autosave. The caller rolls the board back.
      this.pending = [];
    }
    return applied;
  }

  notifyInkErase(rect: Rect): void {
    this.inkListener?.({ kind: "erase", rect });
  }

  private async apply(engine: CanvasEngine, c: CanvasCommand): Promise<boolean> {
    const customRenderer = this.renderers.get(c.tool);
    if (customRenderer) {
      await customRenderer(engine, c);
      return true;
    }
    switch (c.tool) {
      case "draw":
        drawPolyline(engine, c.points, c.size, c.color);
        return true;
      case "erase":
        if (c.mode === "rect" && c.x !== undefined && c.y !== undefined && c.w !== undefined && c.h !== undefined) {
          const rect = { x: c.x, y: c.y, w: c.w, h: c.h };
          eraseRegion(engine, rect);
          this.inkListener?.({ kind: "erase", rect });
          return true;
        }
        if (c.mode === "path" && c.points) {
          const size = c.size ?? 80;
          for (let i = 1; i < c.points.length; i++) {
            strokeSegment(
              engine,
              { x: c.points[i - 1][0], y: c.points[i - 1][1] },
              { x: c.points[i][0], y: c.points[i][1] },
              { erase: true, size, color: "#000" }
            );
          }
          return true;
        }
        return false;
      default:
        return false;
    }
  }
}

function drawPolyline(
  engine: CanvasEngine,
  points: DrawPoint[],
  size: number,
  color: string
): void {
  for (let i = 1; i < points.length; i++) {
    strokeSegment(engine, points[i - 1], points[i], { erase: false, size, color });
  }
}
