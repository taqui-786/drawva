import { normalizeElementGeometry } from "@canvas/geometry/transform";
import { createElement } from "@canvas/model/elementFactory";
import type { Editor } from "@/canvas/core/Editor";
import type { LineElement, ElementType, Point } from "@/canvas/model/types";
import { createId } from "@canvas/utils/random";
import type { ToolHandler, ToolPointerEvent } from "./Tool";

/**
 * LineTool (§7):
 * - Drag to create a 2-point line, OR click-to-add multiple points.
 * - Shift snaps line segment angle to 15° increments.
 * - Double-click or Enter finishes multi-point drawing.
 * - Esc or tiny drag cancels.
 */
export class LineTool implements ToolHandler {
  readonly name: string;
  protected elementType: ElementType;

  private activePointerId: number | null = null;
  private startScene: Point | null = null;
  private elementId: string | null = null;
  private isMultiPoint = false;
  private committed = false;

  constructor(type: ElementType = "line", name = "line") {
    this.elementType = type;
    this.name = name;
  }

  onPointerDown(editor: Editor, e: ToolPointerEvent): void {
    if (e.button !== 0) return;

    if (!this.elementId) {
      // Start a new line
      this.activePointerId = e.pointerId;
      this.startScene = e.scene;
      this.committed = false;
      this.isMultiPoint = false;
      editor.capturePointer(e.pointerId);

      const el = createElement(this.elementType, {
        id: createId(this.elementType),
        x: e.scene[0],
        y: e.scene[1],
        width: 1,
        height: 1,
      }) as LineElement;
      el.points = [[0, 0], [0, 0]];

      editor.beginTransaction();
      editor.history.noteCreated(el.id);
      editor.scene.addElement(el);
      this.elementId = el.id;
      editor.markDocumentDirty();
    } else if (this.isMultiPoint) {
      // Add next point in multi-point mode
      const el = editor.scene.getElement(this.elementId) as LineElement | undefined;
      if (!el) return;

      const prevPoint = el.points[el.points.length - 2] ?? [0, 0];
      const nextPoint = this.getPoint(el, prevPoint, e.scene, e.shiftKey);

      // Append new tracking point
      el.points[el.points.length - 1] = nextPoint;
      el.points.push([...nextPoint]);
      editor.markDocumentDirty();
    }
  }

  onPointerMove(editor: Editor, e: ToolPointerEvent): void {
    if (!this.elementId) return;
    const el = editor.scene.getElement(this.elementId) as LineElement | undefined;
    if (!el) return;

    const prevPointIndex = Math.max(0, el.points.length - 2);
    const prevPoint = el.points[prevPointIndex];
    const currentPoint = this.getPoint(el, prevPoint, e.scene, e.shiftKey);

    el.points[el.points.length - 1] = currentPoint;
    normalizeElementGeometry(el);
    editor.markDocumentDirty();
  }

  onPointerUp(editor: Editor, e: ToolPointerEvent): void {
    if (!this.elementId || (this.activePointerId !== null && e.pointerId !== this.activePointerId)) {
      return;
    }
    const el = editor.scene.getElement(this.elementId) as LineElement | undefined;
    if (!el) return;

    // Check if initial drag was significant
    if (!this.isMultiPoint && this.startScene) {
      const dist = Math.hypot(e.scene[0] - this.startScene[0], e.scene[1] - this.startScene[1]);
      if (dist * editor.camera.get().zoom > 10) {
        // Simple drag finished!
        this.finish(editor);
        return;
      }
      // Turned into multi-point click mode
      this.isMultiPoint = true;
    }
  }

  onDoubleClick(editor: Editor): void {
    if (!this.elementId) return;
    this.finish(editor);
  }

  finish(editor: Editor): void {
    if (!this.elementId) return;
    const el = editor.scene.getElement(this.elementId) as LineElement | undefined;

    if (el) {
      // Remove trailing cursor tracking point if multi-point
      if (this.isMultiPoint && el.points.length > 2) {
        el.points.pop();
      }

      // Filter out duplicate or near-zero segments
      const filtered: Point[] = [el.points[0]];
      for (let i = 1; i < el.points.length; i++) {
        const last = filtered[filtered.length - 1];
        const curr = el.points[i];
        if (Math.hypot(curr[0] - last[0], curr[1] - last[1]) > 1) {
          filtered.push(curr);
        }
      }
      el.points = filtered;

      if (el.points.length < 2) {
        editor.scene.removeElement(el.id);
        editor.history.discardTransaction();
      } else {
        normalizeElementGeometry(el);
        editor.commitHistory();
        this.committed = true;
        editor.selectOnly(el.id);
        if (!editor.isToolLocked()) {
          editor.setActiveTool("select");
        }
      }
    } else {
      editor.history.discardTransaction();
    }

    this.reset(editor);
  }

  cancel(editor: Editor): void {
    if (this.elementId && !this.committed) {
      editor.scene.removeElement(this.elementId);
      editor.history.discardTransaction();
      editor.markDocumentDirty();
    }
    this.reset(editor);
  }

  private reset(editor: Editor): void {
    this.activePointerId = null;
    this.startScene = null;
    this.elementId = null;
    this.isMultiPoint = false;
    this.committed = false;
    editor.releasePointer();
  }

  onExit(editor: Editor): void {
    this.cancel(editor);
  }

  /** Calculate point relative to element origin, optionally angle-snapped relative to prevPoint. */
  private getPoint(el: LineElement, prevPoint: Point, scene: Point, shift: boolean): Point {
    const rawLocal: Point = [scene[0] - el.x, scene[1] - el.y];
    if (!shift) return rawLocal;

    // Angle snapping to 15° increments relative to previous point (§64)
    const dx = rawLocal[0] - prevPoint[0];
    const dy = rawLocal[1] - prevPoint[1];
    const dist = Math.hypot(dx, dy);
    let angle = Math.atan2(dy, dx);
    const step = Math.PI / 12; // 15 degrees
    angle = Math.round(angle / step) * step;

    return [
      prevPoint[0] + Math.cos(angle) * dist,
      prevPoint[1] + Math.sin(angle) * dist,
    ];
  }
}
