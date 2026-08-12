import type { CanvasEngine } from "./engine";
import type { CanvasCommand, DrawPoint } from "./commands";
import { eraseRegion } from "./selection";
import { strokeSegment } from "./strokes";

/**
 * AI draft lifecycle. Commands arrive validated; they are held as a "draft"
 * (rendered as a ghost on the interaction/overlay layer), then either
 * ACCEPTED (committed into the ink tiles + push to undo stack) or DISCARDED
 * (dropped, nothing touches the tiles).
 *
 * Renderers for write_text / draw_formula / plot_function / html_widget /
 * diagram_source are pluggable and registered by the React shell (they may
 * create living objects instead of baking pixels).
 */
export type RenderCommand = (
  engine: CanvasEngine,
  command: CanvasCommand
) => Promise<void> | void;

export class DraftManager {
  private pending: CanvasCommand[] = [];
  private renderers = new Map<string, RenderCommand>();

  /** Registered by later parts for draw_formula/plot/widgets/diagrams. */
  setRenderer(tool: string, fn: RenderCommand): void {
    this.renderers.set(tool, fn);
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

  /** Drop the current draft without committing anything. */
  discard(): void {
    this.pending = [];
  }

  /**
   * Commit the validated draft into the board. Raster-able commands are applied
   * directly to the tiles; the rest go through the registered renderers.
   */
  async accept(engine: CanvasEngine): Promise<number> {
    let applied = 0;
    for (const c of this.pending) {
      const ok = await this.apply(engine, c);
      if (ok) applied++;
    }
    this.pending = [];
    return applied;
  }

  private async apply(engine: CanvasEngine, c: CanvasCommand): Promise<boolean> {
    switch (c.tool) {
      case "draw":
        drawPolyline(engine, c.points, c.size, c.color);
        return true;
      case "erase":
        if (c.mode === "rect" && c.x !== undefined && c.y !== undefined && c.w !== undefined && c.h !== undefined) {
          eraseRegion(engine, { x: c.x, y: c.y, w: c.w, h: c.h });
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
      default: {
        const renderer = this.renderers.get(c.tool);
        if (!renderer) return false;
        await renderer(engine, c);
        return true;
      }
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
