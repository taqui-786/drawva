import type { Editor } from "@/canvas/core/Editor";
import type { Point } from "@/canvas/model/types";

/**
 * Normalized tool input. Tools only ever see scene coordinates (§16) — screen
 * conversion happens once in PointerManager.
 */
export interface ToolHandler {
  readonly name: string;
  cursor?: string;

  onEnter?(editor: Editor): void;
  onExit?(editor: Editor): void;

  onPointerDown?(editor: Editor, e: ToolPointerEvent): void;
  onPointerMove?(editor: Editor, e: ToolPointerEvent): void;
  onPointerUp?(editor: Editor, e: ToolPointerEvent): void;
  onDoubleClick?(editor: Editor, e: ToolPointerEvent): void;
  /** Explicitly finish the current in-progress operation (e.g. Enter key or double-click). */
  finish?(editor: Editor): void;
  /** Cancel/abort the current in-progress operation (e.g. Escape key). */
  cancel?(editor: Editor): void;
}

export interface ToolPointerEvent {
  /** scene coordinates (document space) */
  scene: Point;
  /** screen px relative to the canvas element */
  screen: Point;
  button: number;
  pointerType: "mouse" | "pen" | "touch";
  pressure: number;
  altKey: boolean;
  shiftKey: boolean;
  /** primary action modifier: Meta on macOS, Ctrl elsewhere (§64) */
  ctrlKey: boolean;
  pointerId: number;
}
