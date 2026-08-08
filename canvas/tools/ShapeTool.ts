import { elementFromDrag } from "@canvas/geometry/transform";
import { createElement } from "@canvas/model/elementFactory";
import type { Editor } from "@/canvas/core/Editor";
import type { ElementType, Point } from "@/canvas/model/types";
import { createId } from "@canvas/utils/random";
import type { ToolHandler, ToolPointerEvent } from "./Tool";

/**
 * Shape drawing tools (rectangle/ellipse/diamond). Drag out a rect; Shift
 * constrains to a square; Alt draws from center (§64). Commits one history
 * entry on pointer up.
 */
export class ShapeTool implements ToolHandler {
  readonly name;
  private type: ElementType;

  private activePointerId: number | null = null;
  private start: Point | null = null;
  private elementId: string | null = null;
  /** true once the element has been committed to history (do not remove on exit) */
  private committed = false;

  constructor(type: ElementType, name: string) {
    this.type = type;
    this.name = name;
  }

  onPointerDown(editor: Editor, e: ToolPointerEvent): void {
    if (e.button !== 0 || this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    this.start = e.scene;
    this.elementId = null;
    this.committed = false;
    editor.capturePointer(e.pointerId);
  }

  onPointerMove(editor: Editor, e: ToolPointerEvent): void {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId || !this.start) {
      return;
    }
    const geo = this.geometryFromDrag(this.start, e.scene, e.shiftKey, e.altKey);
    if (!this.elementId) {
      const el = createElement(this.type, {
        id: createId(this.type),
        x: geo.x,
        y: geo.y,
        width: geo.width,
        height: geo.height,
      });
      editor.beginTransaction();
      editor.history.noteCreated(el.id);
      editor.scene.addElement(el);
      this.elementId = el.id;
    } else {
      editor.scene.updateElement(this.elementId, (el) => {
        el.x = geo.x;
        el.y = geo.y;
        el.width = geo.width;
        el.height = geo.height;
      });
    }
    editor.markDocumentDirty();
  }

  onPointerUp(editor: Editor, e: ToolPointerEvent): void {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId) return;
    const el = this.elementId ? editor.scene.getElement(this.elementId) : null;

    // tiny clicks don't create shapes
    if (el && el.width * editor.camera.get().zoom < 2 && el.height * editor.camera.get().zoom < 2) {
      editor.scene.removeElement(el.id);
      editor.history.discardTransaction();
      this.elementId = null;
    } else if (el) {
      editor.commitHistory();
      this.committed = true;
      editor.selectOnly(el.id);
      // return to select unless the tool is locked with Q (§63)
      if (!editor.isToolLocked()) {
        editor.setActiveTool("select");
      }
    } else {
      editor.history.discardTransaction();
    }

    this.reset(editor);
  }

  private geometryFromDrag(a: Point, b: Point, shift: boolean, alt: boolean) {
    let end = b;
    if (shift) {
      // square constraint
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      end = [a[0] + Math.sign(dx || 1) * side, a[1] + Math.sign(dy || 1) * side];
    }
    return elementFromDrag(a, end, alt);
  }

  private reset(editor: Editor): void {
    this.activePointerId = null;
    this.start = null;
    this.elementId = null;
    this.committed = false;
    editor.releasePointer();
  }

  onExit(editor: Editor): void {
    // tool switched away mid-drag: only remove if never committed
    if (this.elementId && !this.committed) {
      editor.scene.removeElement(this.elementId);
      editor.history.discardTransaction();
      editor.markDocumentDirty();
    }
    this.reset(editor);
  }
}