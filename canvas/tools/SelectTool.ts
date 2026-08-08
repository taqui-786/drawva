import { HIT_TOLERANCE_SCREEN_PX } from "@canvas/constants/defaults";
import {
  elementMatchesRect,
  hitTestElement,
} from "@canvas/geometry/elementGeometry";
import { hitTestHandles } from "@canvas/geometry/selectionGeometry";
import { rectFromPoints } from "@canvas/geometry/rectangle";
import {
  normalizeElementGeometry,
  resizeRectFromPointer,
  type ResizeHandle,
} from "@canvas/geometry/transform";
import type { Editor } from "@/canvas/core/Editor";
import type { CanvasElement, Point } from "@/canvas/model/types";
import type { ToolHandler, ToolPointerEvent } from "./Tool";

type Mode = "idle" | "maybe-move" | "move" | "resize" | "rotate" | "marquee";

/**
 * Select tool (§25, §40-§45):
 *  - click / shift-click to select
 *  - drag on an element moves all unlocked selected elements
 *  - drag on empty canvas box-selects (§26, containment semantics)
 *  - drag on a handle resizes — Shift keeps aspect
 *  - drag on rotation handle rotates — Shift snaps to 15°
 *  - Alt-drag duplicates (§53)
 */
export class SelectTool implements ToolHandler {
  readonly name = "select";

  private dragStart: Point | null = null;
  private pointerId: number | null = null;
  private mode: Mode = "idle";

  /** ids of elements allowed to move/rotate during gestures, stable order */
  private movableIds: string[] = [];
  /** start positions of movable elements, parallel with movableIds */
  private moveSnapshot: [number, number][] = [];

  private resizeHandle: Exclude<ResizeHandle, "rotation"> | null = null;
  private resizeOrigin: { point: Point; rect: { x: number; y: number; width: number; height: number }; angle: number; id: string } | null = null;

  private rotateCenter: Point | null = null;
  private rotateStartPointerAngle = 0;
  private rotateStartElementAngles: Map<string, number> = new Map();

  private duplicatedFrom = false;

  onPointerDown(editor: Editor, e: ToolPointerEvent): void {
    if (e.button !== 0 || this.pointerId !== null) return;

    const selected = editor.getSelectedElements();

    // 1) handles first (§24)
    for (const el of selected) {
      const handle = hitTestHandles(el, editor.camera.get(), e.screen);
      if (!handle) continue;
      editor.history.beginTransaction();
      this.pointerId = e.pointerId;
      editor.capturePointer(e.pointerId);
      this.dragStart = e.scene;
      this.duplicatedFrom = false;

      if (handle === "rotation") {
        this.mode = "rotate";
        this.rotateCenter = editor.selectionCenter();
        this.rotateStartPointerAngle = Math.atan2(
          e.scene[1] - this.rotateCenter[1],
          e.scene[0] - this.rotateCenter[0],
        );
        this.rotateStartElementAngles.clear();
        for (const sel of selected) {
          if (sel.locked) continue;
          editor.history.captureSnapshot(sel);
          this.rotateStartElementAngles.set(sel.id, sel.angle);
        }
      } else {
        this.mode = "resize";
        this.resizeHandle = handle;
        // single-select resize uses the single element; multi-select resizes each proportionally (stretch goal)
        const target = selected.length === 1 ? selected[0] : el;
        this.resizeOrigin = {
          id: target.id,
          point: e.scene,
          angle: target.angle,
          rect: { x: target.x, y: target.y, width: target.width, height: target.height },
        };
        editor.history.captureSnapshot(target);
      }
      return;
    }

    // 2) element hit
    const hit = this.hitElement(editor, e.scene);
    if (hit) {
      editor.history.beginTransaction();
      if (e.shiftKey) {
        editor.toggleSelected(hit.id);
      } else if (!editor.isSelected(hit.id)) {
        editor.selectOnly(hit.id);
      }
      const movable = editor.getSelectedElements().filter((el) => !el.locked);
      this.movableIds = movable.map((el) => el.id);
      this.moveSnapshot = movable.map((el) => [el.x, el.y]);
      for (const el of movable) editor.history.captureSnapshot(el);
      this.mode = movable.length > 0 ? "maybe-move" : "idle";
      this.pointerId = e.pointerId;
      editor.capturePointer(e.pointerId);
      this.dragStart = e.scene;
      editor.markInteractiveDirty();
      return;
    }

    // 3) marquee
    this.mode = "marquee";
    this.pointerId = e.pointerId;
    editor.capturePointer(e.pointerId);
    this.dragStart = e.scene;
    if (!e.shiftKey) editor.clearSelection();
    editor.setMarquee(rectFromPoints(e.scene, e.scene));
  }

  onPointerMove(editor: Editor, e: ToolPointerEvent): void {
    if (this.pointerId === null) {
      // hover cursor feedback only
      const geometryHandle = this.hoverHandle(editor, e.screen);
      if (geometryHandle) {
        editor.setCursor(cursorForHandle(geometryHandle));
        return;
      }
      const hit = this.hitElement(editor, e.scene);
      editor.setCursor(hit && !hit.locked ? "move" : "default");
      return;
    }
    if (e.pointerId !== this.pointerId || !this.dragStart) return;

    const dx = e.scene[0] - this.dragStart[0];
    const dy = e.scene[1] - this.dragStart[1];

    switch (this.mode) {
      case "maybe-move": {
        if (Math.hypot(dx, dy) * editor.camera.get().zoom < 3) break;
        if (e.altKey && !this.duplicatedFrom) {
          // Alt-drag duplicates: replace selection with the clones, then keep dragging (§53)
          this.duplicatedFrom = true;
          const clones = editor.duplicateSelection();
          if (clones.length === 0) break;
          this.movableIds = clones.map((el) => el.id);
          this.moveSnapshot = clones.map((el) => [el.x, el.y]);
          for (const el of clones) editor.history.captureSnapshot(el);
          this.dragStart = e.scene; // re-anchor
          break;
        }
        this.mode = "move";
        // fall through
      }
      case "move": {
        for (let i = 0; i < this.movableIds.length; i++) {
          const start = this.moveSnapshot[i];
          if (!start) continue;
          editor.scene.updateElement(this.movableIds[i], (el) => {
            el.x = start[0] + dx;
            el.y = start[1] + dy;
          });
        }
        editor.markDocumentDirty();
        break;
      }
      case "resize": {
        if (!this.resizeHandle || !this.resizeOrigin) break;
        const origin = this.resizeOrigin;
        const next = resizeRectFromPointer(
          this.resizeHandle,
          origin.rect,
          [
            origin.rect.x + origin.rect.width / 2,
            origin.rect.y + origin.rect.height / 2,
          ],
          origin.angle,
          e.scene,
          e.shiftKey,
        );
        editor.scene.updateElement(origin.id, (el) => {
          el.x = next.x;
          el.y = next.y;
          el.width = next.width;
          el.height = next.height;
        });
        editor.markDocumentDirty();
        break;
      }
      case "rotate": {
        if (!this.rotateCenter) break;
        const current = Math.atan2(
          e.scene[1] - this.rotateCenter[1],
          e.scene[0] - this.rotateCenter[0],
        );
        let delta = current - this.rotateStartPointerAngle;
        if (e.shiftKey) delta = Math.round(delta / (Math.PI / 12)) * (Math.PI / 12);
        for (const [id, startAngle] of this.rotateStartElementAngles) {
          editor.scene.updateElement(id, (el) => {
            el.angle = startAngle + delta;
          });
        }
        editor.markDocumentDirty();
        break;
      }
      case "marquee": {
        editor.setMarquee(rectFromPoints(this.dragStart, e.scene));
        editor.markInteractiveDirty();
        break;
      }
      case "idle":
        break;
    }
  }

  onPointerUp(editor: Editor, e: ToolPointerEvent): void {
    if (this.pointerId === null || e.pointerId !== this.pointerId) return;

    if (this.mode === "marquee") {
      const marquee = editor.getMarquee();
      if (marquee && marquee.width * editor.camera.get().zoom > 2) {
        const found = editor.scene
          .getNonDeletedElements()
          .filter((el) => !el.locked)
          .filter((el) => elementMatchesRect(el, marquee, true))
          .map((el) => el.id);
        if (e.shiftKey) editor.addToSelection(found);
        else editor.setSelection(found);
      }
      editor.setMarquee(null);
    } else if (this.mode === "resize") {
      const target = this.resizeOrigin?.id
        ? editor.scene.getElement(this.resizeOrigin.id)
        : undefined;
      if (target) normalizeElementGeometry(target);
      editor.commitHistory(); // one entry per gesture (§53/§54)
    } else if (this.mode === "move" || this.mode === "rotate") {
      editor.commitHistory();
    } else if (editor.history.isRecording()) {
      editor.history.discardTransaction(); // plain click without a real gesture
    }

    this.reset(editor);
  }

  private hitElement(editor: Editor, scene: Point): CanvasElement | null {
    const elements = editor.scene.getNonDeletedElements();
    const tolerance = HIT_TOLERANCE_SCREEN_PX / editor.camera.get().zoom;
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (hitTestElement(el, scene, tolerance)) return el;
    }
    return null;
  }

  private hoverHandle(editor: Editor, screen: Point): ResizeHandle | null {
    for (const el of editor.getSelectedElements()) {
      const h = hitTestHandles(el, editor.camera.get(), screen);
      if (h) return h;
    }
    return null;
  }

  private reset(editor: Editor): void {
    this.pointerId = null;
    this.dragStart = null;
    this.mode = "idle";
    this.movableIds = [];
    this.moveSnapshot = [];
    this.resizeHandle = null;
    this.resizeOrigin = null;
    this.rotateCenter = null;
    this.rotateStartElementAngles.clear();
    this.duplicatedFrom = false;
    editor.releasePointer();
    editor.markInteractiveDirty();
  }

  onExit(editor: Editor): void {
    this.reset(editor);
  }
}

function cursorForHandle(handle: ResizeHandle): string {
  switch (handle) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "nw":
    case "se":
      return "nwse-resize";
    case "rotation":
      return "grab";
    default:
      return "default";
  }
}
