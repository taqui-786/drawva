import { normalizeElementGeometry } from "@canvas/geometry/transform";
import { createElement } from "@canvas/model/elementFactory";
import type { Editor } from "@/canvas/core/Editor";
import type { FreedrawElement, Point } from "@/canvas/model/types";
import { createId } from "@canvas/utils/random";
import type { ToolHandler, ToolPointerEvent } from "./Tool";

/**
 * FreedrawTool (§11):
 * Freehand drawing tool collecting points + pressures (real or simulated).
 * Applies point smoothing/streamlining and normalizes geometry on completion.
 */
export class FreedrawTool implements ToolHandler {
  readonly name = "freedraw";

  private activePointerId: number | null = null;
  private elementId: string | null = null;
  private lastTime = 0;
  private lastPoint: Point | null = null;
  private committed = false;

  onPointerDown(editor: Editor, e: ToolPointerEvent): void {
    if (e.button !== 0 || this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    this.elementId = null;
    this.committed = false;
    this.lastTime = Date.now();
    this.lastPoint = e.scene;

    editor.capturePointer(e.pointerId);

    const pressure = e.pressure > 0 ? e.pressure : 0.5;

    const el = createElement("freedraw", {
      id: createId("freedraw"),
      x: e.scene[0],
      y: e.scene[1],
      width: 1,
      height: 1,
    }) as FreedrawElement;

    el.points = [[0, 0]];
    el.pressures = [pressure];

    editor.beginTransaction();
    editor.history.noteCreated(el.id);
    editor.scene.addElement(el);
    this.elementId = el.id;
    editor.markDocumentDirty();
  }

  onPointerMove(editor: Editor, e: ToolPointerEvent): void {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId || !this.elementId) {
      return;
    }
    const el = editor.scene.getElement(this.elementId) as FreedrawElement | undefined;
    if (!el) return;

    const now = Date.now();
    const dt = Math.max(1, now - this.lastTime);
    const lastP = this.lastPoint ?? e.scene;
    const dist = Math.hypot(e.scene[0] - lastP[0], e.scene[1] - lastP[1]);

    // Calculate simulated pressure from velocity if pen pressure is unavailable
    let pressure = e.pressure;
    if (pressure <= 0 || e.pointerType === "mouse") {
      const speed = dist / dt;
      // Faster = thinner (lower pressure), Slower = thicker (higher pressure)
      pressure = Math.max(0.15, Math.min(0.85, 1 - speed / 3));
    }

    // Streamline / minimum point distance (only append if point moved enough)
    if (dist * editor.camera.get().zoom < 1.5 && el.points.length > 1) {
      return;
    }

    const localPoint: Point = [e.scene[0] - el.x, e.scene[1] - el.y];
    el.points.push(localPoint);
    el.pressures.push(pressure);

    this.lastTime = now;
    this.lastPoint = e.scene;

    normalizeElementGeometry(el);
    editor.markDocumentDirty();
  }

  onPointerUp(editor: Editor, e: ToolPointerEvent): void {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId) return;
    const el = this.elementId ? (editor.scene.getElement(this.elementId) as FreedrawElement | undefined) : undefined;

    if (el && el.points.length > 1) {
      normalizeElementGeometry(el);
      editor.commitHistory();
      this.committed = true;
      editor.selectOnly(el.id);
      if (!editor.isToolLocked()) {
        editor.setActiveTool("select");
      }
    } else if (el) {
      editor.scene.removeElement(el.id);
      editor.history.discardTransaction();
    } else {
      editor.history.discardTransaction();
    }

    this.reset(editor);
  }

  onExit(editor: Editor): void {
    if (this.elementId && !this.committed) {
      editor.scene.removeElement(this.elementId);
      editor.history.discardTransaction();
      editor.markDocumentDirty();
    }
    this.reset(editor);
  }

  private reset(editor: Editor): void {
    this.activePointerId = null;
    this.elementId = null;
    this.lastPoint = null;
    this.committed = false;
    editor.releasePointer();
  }
}
