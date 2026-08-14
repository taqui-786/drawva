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

/** A pointer event normalized for tool routing. */
export interface ToolGestureEvent {
  pointerId: number;
  /** World-space position under the pointer. */
  world: Point;
  /** CSS-pixel position relative to the canvas root. */
  screen: Point;
  /** 0 = main, 1 = middle, 2 = right. */
  button: number;
  pressure: number;
}

/** A live DOM shell grabbed by the select tool (widget/object). */
export interface PickedNode {
  kind: "widget" | "object";
  id: string;
}

/**
 * Selectable-shell hook (Penecho hit-first rule): the select tool checks for a
 * widget/object under the pointer before falling back to ink/marquee selection.
 */
export interface ShellPicker {
  /** Top-most shell at `world`, or null. */
  pick(world: Point): PickedNode | null;
  /** Highlight (or clear) the shell under the cursor. */
  focus(node: PickedNode | null): void;
  /** Translate a shell by a world-space delta during a drag. */
  translate(node: PickedNode, dx: number, dy: number, world: Point): void;
  /** Called when a drag ends to broadcast unthrottled final position. */
  endTranslate?(node: PickedNode): void;
}

/**
 * Framework-free dispatcher that routes pointer gestures to the correct tool
 * controller based on the active canvas mode (Penecho single-router dispatch).
 * Every gesture — pan, shell drag, selection move, drawing — is owned here, so
 * no gesture state leaks into the React shell. Text/images are DOM-driven and
 * handled by the React shell via the exported helpers.
 */
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

  setMode(mode: CanvasMode): void {
    // Cancel any in-progress shape/selection gesture on mode switch.
    this.shapes.cancel();
    this.selection.clearSelection();
    this.pan = null;
    this.nodeDrag = null;
    this.mode = mode;
    this.updateCursor();
  }

  /** Determine CSS cursor style for current tool mode & pointer position. */
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
      } catch {
        // layer might be initializing
      }
    }
  }

  begin(ev: ToolGestureEvent): void {
    // Penecho hit-first priority: pan owns middle-drag and the hand mode.
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
    // A floating selection owns the pointer while it is being dragged.
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
        // A select-mode empty-ground drag is a rectangle marquee; updateMarquee
        // is a no-op unless a marquee is actually running.
        this.selection.updateMarquee(ev.world);
        break;
      case "hand":
      case "text":
        break;
    }
    this.updateCursor(ev.world);
  }

  /** Finish a gesture. Returns true if it mutated the board (shell drag/move). */
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
          // Close any rectangle marquee started from select-mode empty ground.
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

  /** Pointer-cancel: treat like a quick release so no gesture lingers. */
  cancel(pointerId: number): boolean {
    return this.end(pointerId);
  }

  deleteSelection(): void {
    this.selection.deleteSelection();
  }

  clearSelection(): void {
    this.selection.clearSelection();
  }

  /** Penecho-style select: selection-box → shell hit → ink → rectangle marquee. */
  private beginSelect(ev: ToolGestureEvent): void {
    // 1. Drag an existing selection from inside its box or near its border line.
    if (this.selection.hasSelection && this.selection.hitTest(ev.world)) {
      this.selection.beginMove(ev.pointerId, ev.world);
      return;
    }
    // 2. Shell hit-first (widgets/objects).
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
    // 3. Click-select ink under the pointer, then drag to move.
    if (this.selection.selectElementAtPoint(ev.world)) {
      this.selection.beginMove(ev.pointerId, ev.world);
      return;
    }
    // 4. Empty ground: drag a rectangular marquee to select an area.
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