import {
  ARROW_KEY_STEP,
  ARROW_KEY_STEP_SHIFT,
  ZOOM_STEP,
} from "@canvas/constants/defaults";
import { toolForKey } from "@canvas/constants/shortcuts";
import type { Editor } from "@/canvas/core/Editor";
import { isMac } from "./PointerManager";

/**
 * Keyboard shortcuts (§62-§64). One registry, no scattered listeners.
 * Skips events whose target is an editable field (typing in inputs/text editor).
 */
export class KeyboardManager {
  private editor: Editor;
  private remove: (() => void)[] = [];

  constructor(editor: Editor) {
    this.editor = editor;
  }

  mount(target: Window): void {
    const keydown = (e: KeyboardEvent) => this.onKeyDown(e);
    const keyup = (e: KeyboardEvent) => this.onKeyUp(e);
    target.addEventListener("keydown", keydown);
    target.addEventListener("keyup", keyup);
    this.remove.push(() => target.removeEventListener("keydown", keydown));
    this.remove.push(() => target.removeEventListener("keyup", keyup));
  }

  private onKeyDown(e: KeyboardEvent): void {
    const editor = this.editor;
    const mod = isMac() ? e.metaKey : e.ctrlKey;

    if (isEditableTarget(e.target)) return;

    if (e.code === "Space") {
      if (!e.repeat) editor.setSpaceHeld(true);
      e.preventDefault();
      return;
    }

    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      editor.redo();
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      editor.selectAll();
      return;
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      editor.duplicateSelection();
      return;
    }
    if (mod && e.key === "0") {
      e.preventDefault();
      editor.camera.resetZoom();
      editor.markCameraDirty();
      return;
    }
    if (mod && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      editor.camera.setZoomAtCenter(editor.camera.get().zoom * ZOOM_STEP);
      editor.markCameraDirty();
      return;
    }
    if (mod && e.key === "-") {
      e.preventDefault();
      editor.camera.setZoomAtCenter(editor.camera.get().zoom / ZOOM_STEP);
      editor.markCameraDirty();
      return;
    }
    if (e.shiftKey && e.key === "!") {
      editor.zoomToFit();
      return;
    }
    if (e.shiftKey && e.key === "@") {
      editor.zoomToSelection();
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      editor.deleteSelection();
      return;
    }

    if (e.key === "Escape") {
      editor.setActiveTool("select");
      editor.clearSelection();
      return;
    }

    if (e.key === "q") {
      editor.toggleToolLock();
      return;
    }

    // arrow-key nudging (§44)
    if (e.key.startsWith("Arrow")) {
      const step = e.shiftKey ? ARROW_KEY_STEP_SHIFT : ARROW_KEY_STEP;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        editor.nudgeSelection(dx, dy);
      }
      return;
    }

    // tool shortcuts
    if (!mod && !e.altKey && e.key.length === 1) {
      const tool = toolForKey(e.key);
      if (tool && editor.hasTool(tool)) {
        e.preventDefault();
        editor.setActiveTool(tool);
      }
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.code === "Space") {
      this.editor.setSpaceHeld(false);
    }
  }

  destroy(): void {
    for (const r of this.remove) r();
    this.remove = [];
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}
