import { HIT_TOLERANCE_SCREEN_PX } from "@canvas/constants/defaults";
import { hitTestElement } from "@canvas/geometry/elementGeometry";
import type { Editor } from "@/canvas/core/Editor";
import type { ToolHandler, ToolPointerEvent } from "./Tool";

/**
 * EraserTool:
 * Drag across elements on canvas to erase them.
 * Commits a single history transaction per drag gesture.
 */
export class EraserTool implements ToolHandler {
  readonly name = "eraser";
  cursor = "crosshair";

  private activePointerId: number | null = null;
  private erasedIds = new Set<string>();

  onPointerDown(editor: Editor, e: ToolPointerEvent): void {
    if (e.button !== 0 || this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    this.erasedIds.clear();
    editor.capturePointer(e.pointerId);

    editor.beginTransaction();
    this.eraseAtPoint(editor, e);
  }

  onPointerMove(editor: Editor, e: ToolPointerEvent): void {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId) {
      return;
    }
    this.eraseAtPoint(editor, e);
  }

  onPointerUp(editor: Editor, e: ToolPointerEvent): void {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId) return;

    if (this.erasedIds.size > 0) {
      editor.commitHistory();
    } else {
      editor.history.discardTransaction();
    }

    this.reset(editor);
  }

  onExit(editor: Editor): void {
    if (this.erasedIds.size > 0 && editor.history.isRecording()) {
      editor.commitHistory();
    } else if (editor.history.isRecording()) {
      editor.history.discardTransaction();
    }
    this.reset(editor);
  }

  private eraseAtPoint(editor: Editor, e: ToolPointerEvent): void {
    const tolerance = (HIT_TOLERANCE_SCREEN_PX * 1.5) / editor.camera.get().zoom;
    const elements = editor.scene.getNonDeletedElements();

    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el.locked || this.erasedIds.has(el.id)) continue;

      if (hitTestElement(el, e.scene, tolerance)) {
        this.erasedIds.add(el.id);
        editor.history.captureSnapshot(el);
        editor.history.markDeleted(el);
        editor.markDocumentDirty();
      }
    }
  }

  private reset(editor: Editor): void {
    this.activePointerId = null;
    this.erasedIds.clear();
    editor.releasePointer();
  }
}
