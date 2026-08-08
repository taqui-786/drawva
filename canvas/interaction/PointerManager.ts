import { ZOOM_STEP } from "@canvas/constants/defaults";
import type { Editor } from "@/canvas/core/Editor";
import type { Point } from "@/canvas/model/types";
import type { ToolPointerEvent } from "@canvas/tools/Tool";

const PRIMARY_BUTTON = 0;
const MIDDLE_BUTTON = 1;

/**
 * Owns all raw DOM input for the interactive layer (§59-§61). Translates
 * PointerEvents into scene coordinates and forwards to the active tool.
 * Also handles: middle-button / space pan (§19) and wheel zoom/pan (§18).
 */
export class PointerManager {
  private editor: Editor;
  private canvas: HTMLCanvasElement;
  private disposers: (() => void)[] = [];

  /** screen-space position of the last known pointer, for wheel zoom anchor */
  private lastPointerScreen: Point = [0, 0];
  private spaceHeld = false;
  /** middle-button pan state (independent of active tool) */
  private panPointerId: number | null = null;
  private panLastScreen: Point | null = null;

  constructor(editor: Editor, canvas: HTMLCanvasElement) {
    this.editor = editor;
    this.canvas = canvas;
  }

  mount(): void {
    // bind with explicit event types — HTMLElementEventMap lacks typed PointerEvent entries
    const on = <E extends Event>(
      type: string,
      handler: (e: E) => void,
      options?: AddEventListenerOptions,
    ) => {
      const listener = handler as EventListener;
      this.canvas.addEventListener(type, listener, options);
      this.disposers.push(() => this.canvas.removeEventListener(type, listener, options));
    };

    on<PointerEvent>("pointerdown", this.wrap(this.onPointerDown));
    on<PointerEvent>("pointermove", this.wrap(this.onPointerMove));
    on<PointerEvent>("pointerup", this.wrap(this.onPointerUp));
    on<PointerEvent>("pointercancel", this.wrap(this.onPointerUp));
    on<WheelEvent>("wheel", this.onWheel, { passive: false });
    on<MouseEvent>("contextmenu", (e) => e.preventDefault());
    on<MouseEvent>("dblclick", (e) => this.wrapMouse(e, this.onDoubleClick));
  }

  setSpaceHeld(held: boolean): void {
    this.spaceHeld = held;
  }

  private wrap(handler: (e: PointerEvent) => void) {
    return (e: PointerEvent) => {
      e.preventDefault();
      handler(e);
    };
  }

  /** dblclick fires as MouseEvent; reuse the tool pipeline with pointer-ish shape. */
  private wrapMouse(e: MouseEvent, handler: (e: PointerEvent) => void) {
    e.preventDefault();
    handler(e as unknown as PointerEvent);
  }

  private toEvent(e: PointerEvent): ToolPointerEvent {
    const rect = this.canvas.getBoundingClientRect();
    const screen: Point = [e.clientX - rect.left, e.clientY - rect.top];
    const scene = this.editor.camera.screenToScene(screen);
    this.lastPointerScreen = screen;
    return {
      scene,
      screen,
      button: e.button,
      pointerType: e.pointerType === "pen" ? "pen" : e.pointerType === "touch" ? "touch" : "mouse",
      pressure: e.pressure,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      ctrlKey: isMac() ? e.metaKey : e.ctrlKey,
      pointerId: e.pointerId,
    };
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.canvas.focus();
    const event = this.toEvent(e);

    // pan shortcuts take priority over tools (§19)
    if (e.button === MIDDLE_BUTTON || this.spaceHeld) {
      this.panPointerId = e.pointerId;
      this.panLastScreen = event.screen;
      this.editor.capturePointer(e.pointerId);
      this.editor.setCursor("grabbing");
      return;
    }

    this.editor.getActiveTool().onPointerDown?.(this.editor, event);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const event = this.toEvent(e);
    if (this.panPointerId === e.pointerId && this.panLastScreen) {
      const dx = event.screen[0] - this.panLastScreen[0];
      const dy = event.screen[1] - this.panLastScreen[1];
      this.editor.camera.panByScreenDelta(dx, dy);
      this.panLastScreen = event.screen;
      this.editor.markCameraDirty();
      return;
    }
    this.editor.getActiveTool().onPointerMove?.(this.editor, event);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const event = this.toEvent(e);
    if (this.panPointerId === e.pointerId) {
      this.panPointerId = null;
      this.panLastScreen = null;
      this.editor.releasePointer();
      this.editor.setCursor(this.spaceHeld ? "grab" : "default");
      return;
    }
    this.editor.getActiveTool().onPointerUp?.(this.editor, event);
  };

  private onDoubleClick = (e: PointerEvent): void => {
    const event = this.toEvent(e);
    this.editor.getActiveTool().onDoubleClick?.(this.editor, event);
  };

  /** Wheel: ctrl+wheel = cursor-centered zoom; plain wheel = pan (§18, §19). */
  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const anchor: Point = [e.clientX - rect.left, e.clientY - rect.top];
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      this.editor.camera.zoomAt(anchor, factor);
    } else {
      this.editor.camera.panByScreenDelta(e.deltaX, e.deltaY);
    }
    this.editor.markCameraDirty();
  };

  destroy(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
  }
}

export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}
export const PRIMARY = PRIMARY_BUTTON;
