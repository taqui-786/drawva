import { CanvasEngine } from "./engine";
import { ShapeController } from "./shapes";
import { SelectionController } from "./selection";
import { StrokeController, type StrokeOptions } from "./strokes";
import type { CanvasMode, Point } from "./types";

export interface ToolStyle {
  color: string;
  pen: number;
  eraser: number;
}

export interface ToolGestureEvent {
  pointerId: number;
  world: Point;
  screen: Point;
  button: number;
  pressure: number;
}

export interface PickedNode {
  kind: "widget" | "object";
  id: string;
}

export interface ShellPicker {
  pick(world: Point): PickedNode | null;
  focus(node: PickedNode | null): void;
  translate(node: PickedNode, dx: number, dy: number, world: Point): void;
  endTranslate?(node: PickedNode): void;
}

export class ToolManager {
  readonly strokes: StrokeController;
  readonly shapes: ShapeController;
  readonly selection: SelectionController;

  mode: CanvasMode;

  private pan: { pointerId: number; last: Point } | null = null;
  private nodeDrag: { pointerId: number; node: PickedNode; last: Point; moved: boolean } | null = null;
  private picker: ShellPicker | null = null;

  constructor(
    private engine: CanvasEngine,
    private getStyle: () => ToolStyle,
    mode: CanvasMode = "hand"
  ) {
    this.mode = mode;
    this.strokes = new StrokeController(engine, () => this.styleToStrokeOptions());
    this.shapes = new ShapeController(engine, this.liveShapeStyle());
    this.selection = new SelectionController(engine);
  }

  setPicker(picker: ShellPicker | null): void {
    this.picker = picker;
  }

  get isInteracting(): boolean {
    return (
      this.pan !== null ||
      this.nodeDrag !== null ||
      this.selection.isMoving ||
      this.selection.isInteracting ||
      this.shapes.isDrawing ||
      this.strokes.drawing
    );
  }

  setMode(mode: CanvasMode): void {
    this.shapes.cancel();
    this.selection.clearSelection();
    this.pan = null;
    this.nodeDrag = null;
    this.mode = mode;
    this.updateCursor();
  }

  getCursor(world?: Point): string {
    if (this.pan) return "grabbing";
    if (this.nodeDrag) return "grabbing";
    if (this.selection.isMoving) return "grabbing";

    if (this.mode === "hand") return "grab";

    if (this.mode === "select") {
      if (world && this.selection.hitTest(world)) return "grab";
      if (world && this.picker?.pick(world)) return "grab";
      return "default";
    }

    if (["pen", "highlighter", "eraser", "rect", "ellipse", "arrow"].includes(this.mode)) {
      return "crosshair";
    }

    if (this.mode === "text") return "text";

    return "default";
  }

  updateCursor(world?: Point): void {
    const cursor = this.getCursor(world);
    this.engine.rootElement.style.cursor = cursor;
    for (const name of ["interaction", "ink", "screen"] as const) {
      try {
        const c = this.engine.canvas(name);
        if (c) c.style.cursor = cursor;
      } catch {}
    }
  }

  begin(ev: ToolGestureEvent): void {
    if (ev.button === 1 || this.mode === "hand") {
      this.pan = { pointerId: ev.pointerId, last: ev.screen };
      this.updateCursor(ev.world);
      return;
    }
    if (ev.button !== 0) {
      this.updateCursor(ev.world);
      return;
    }
    switch (this.mode) {
      case "pen":
      case "highlighter":
      case "eraser":
        this.strokes.begin(ev.pointerId, ev.world, ev.pressure, this.mode);
        break;
      case "rect":
      case "ellipse":
      case "arrow":
        this.shapes.begin(ev.pointerId, ev.world, this.mode);
        break;
      case "select":
        this.beginSelect(ev);
        break;
      case "text":
        break;
    }
    this.updateCursor(ev.world);
  }

  move(ev: ToolGestureEvent): void {
    if (this.pan && this.pan.pointerId === ev.pointerId) {
      this.engine.camera.panBy(ev.screen.x - this.pan.last.x, ev.screen.y - this.pan.last.y);
      this.pan.last = ev.screen;
      this.engine.requestRender();
      this.updateCursor(ev.world);
      return;
    }
    if (this.nodeDrag && this.nodeDrag.pointerId === ev.pointerId) {
      const dx = ev.world.x - this.nodeDrag.last.x;
      const dy = ev.world.y - this.nodeDrag.last.y;
      this.nodeDrag.last = ev.world;
      if (dx !== 0 || dy !== 0) this.nodeDrag.moved = true;
      this.picker?.translate(this.nodeDrag.node, dx, dy, ev.world);
      this.engine.requestRender();
      this.updateCursor(ev.world);
      return;
    }
    if (this.selection.isMoving) {
      this.selection.updateMove(ev.world);
      this.updateCursor(ev.world);
      return;
    }
    switch (this.mode) {
      case "pen":
      case "highlighter":
      case "eraser":
        this.strokes.move(ev.pointerId, ev.world, ev.pressure);
        break;
      case "rect":
      case "ellipse":
      case "arrow":
        this.shapes.move(ev.pointerId, ev.world);
        break;
      case "select":
        this.selection.updateMarquee(ev.world);
        break;
      case "hand":
      case "text":
        break;
    }
    this.updateCursor(ev.world);
  }

  end(pointerId: number): boolean {
    let result = false;
    if (this.pan && this.pan.pointerId === pointerId) {
      this.pan = null;
      result = false;
    } else if (this.nodeDrag && this.nodeDrag.pointerId === pointerId) {
      const moved = this.nodeDrag.moved;
      const node = this.nodeDrag.node;
      this.nodeDrag = null;
      if (moved) {
        this.picker?.endTranslate?.(node);
      }
      result = moved;
    } else if (this.selection.isMoving) {
      result = this.selection.endMove();
    } else {
      switch (this.mode) {
        case "pen":
        case "highlighter":
        case "eraser":
          this.strokes.end(pointerId);
          break;
        case "rect":
        case "ellipse":
        case "arrow":
          this.shapes.end(pointerId);
          break;
        case "select":
          this.selection.endMarquee();
          break;
        case "hand":
        case "text":
          break;
      }
    }
    this.updateCursor();
    return result;
  }

  cancel(pointerId: number): boolean {
    return this.end(pointerId);
  }

  deleteSelection(): void {
    this.selection.deleteSelection();
  }

  clearSelection(): void {
    this.selection.clearSelection();
  }

  private beginSelect(ev: ToolGestureEvent): void {
    if (this.selection.hasSelection && this.selection.hitTest(ev.world)) {
      this.selection.beginMove(ev.pointerId, ev.world);
      return;
    }
    const picker = this.picker;
    if (picker) {
      const hit = picker.pick(ev.world);
      if (hit) {
        picker.focus(hit);
        this.nodeDrag = { pointerId: ev.pointerId, node: hit, last: ev.world, moved: false };
        return;
      }
      picker.focus(null);
    }
    if (this.selection.selectElementAtPoint(ev.world)) {
      this.selection.beginMove(ev.pointerId, ev.world);
      return;
    }
    this.selection.beginMarquee(ev.pointerId, ev.world);
  }

  private styleToStrokeOptions(): StrokeOptions {
    const s = this.getStyle();
    return {
      color: s.color,
      pen: s.pen,
      eraser: s.eraser,
      highlighterTop: false,
    };
  }

  private liveShapeStyle() {
    const getStyle = () => this.getStyle();
    return {
      get color(): string {
        return getStyle().color;
      },
      get lineWidth(): number {
        return Math.max(1, Math.min(24, getStyle().pen));
      },
    };
  }
}