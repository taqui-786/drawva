import type { Editor } from "@/canvas/core/Editor";
import type { Point } from "@/canvas/model/types";
import type { ToolHandler, ToolPointerEvent } from "./Tool";

/** Pan-only tool (§19). Screen-space deltas so it feels 1:1 with the cursor. */
export class HandTool implements ToolHandler {
  readonly name = "hand";
  cursor = "grab";

  private activePointerId: number | null = null;
  private lastScreen: Point | null = null;

  onEnter(editor: Editor): void {
    editor.setCursor("grab");
  }

  onPointerDown(editor: Editor, e: ToolPointerEvent): void {
    if (this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    this.lastScreen = e.screen;
    editor.capturePointer(e.pointerId);
    editor.setCursor("grabbing");
  }

  onPointerMove(editor: Editor, e: ToolPointerEvent): void {
    if (this.activePointerId === null || e.pointerId !== this.activePointerId || !this.lastScreen) {
      return;
    }
    const dx = e.screen[0] - this.lastScreen[0];
    const dy = e.screen[1] - this.lastScreen[1];
    editor.camera.panByScreenDelta(dx, dy);
    this.lastScreen = e.screen;
    editor.markCameraDirty();
  }

  onPointerUp(editor: Editor, e: ToolPointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;
    this.reset(editor);
    editor.setCursor("grab");
  }

  onExit(editor: Editor): void {
    this.reset(editor);
    editor.setCursor("default");
  }

  private reset(editor: Editor): void {
    this.activePointerId = null;
    this.lastScreen = null;
    editor.releasePointer();
  }
}
