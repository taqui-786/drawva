import type { CanvasSize } from "@/canvas/model/types";
import { resetToScreen } from "@canvas/rendering/renderElement";

/**
 * CanvasEngine owns the two stacked canvases (§21) plus DPR handling (§20) and
 * the rAF render loop (§92, §93). Engine-level only: it knows nothing about
 * which renderer functions to call — the Editor wires those.
 */
export class CanvasEngine {
  readonly staticCanvas: HTMLCanvasElement;
  readonly overlayCanvas: HTMLCanvasElement;
  readonly staticCtx: CanvasRenderingContext2D;
  readonly overlayCtx: CanvasRenderingContext2D;

  size: CanvasSize = { width: 0, height: 0 };
  dpr = 1;

  staticDirty = true;
  interactiveDirty = true;

  private resizeObserver: ResizeObserver | null = null;
  private frameHandle: number | null = null;
  private renderCallback: (() => void) | null = null;

  constructor(staticCanvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement) {
    this.staticCanvas = staticCanvas;
    this.overlayCanvas = overlayCanvas;
    const sCtx = staticCanvas.getContext("2d");
    const oCtx = overlayCanvas.getContext("2d");
    if (!sCtx || !oCtx) throw new Error("2D canvas context unavailable");
    this.staticCtx = sCtx;
    this.overlayCtx = oCtx;
  }

  /** Attach to the canvas's CSS box and start listening for size changes. */
  mount(): void {
    this.resize = this.resize.bind(this);
    this.resize();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.staticCanvas.parentElement ?? this.staticCanvas);
    window.addEventListener("resize", this.resize);
  }

  setRenderCallback(cb: () => void): void {
    this.renderCallback = cb;
  }

  /** Schedule a frame — coalesces multiple requests into one rAF (§92). */
  requestRender(kind?: "static" | "interactive" | "both"): void {
    if (kind === undefined || kind === "both" || kind === "static") this.staticDirty = true;
    if (kind === undefined || kind === "both" || kind === "interactive") this.interactiveDirty = true;
    if (this.frameHandle !== null) return;
    this.frameHandle = requestAnimationFrame(() => {
      this.frameHandle = null;
      if (this.renderCallback) this.renderCallback();
    });
  }

  private resize(): void {
    const parent = this.staticCanvas.parentElement;
    const rect = (parent ?? this.staticCanvas).getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.size = { width: rect.width, height: rect.height };

    for (const canvas of [this.staticCanvas, this.overlayCanvas]) {
      canvas.width = Math.round(rect.width * this.dpr);
      canvas.height = Math.round(rect.height * this.dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }
    resetToScreen(this.staticCtx, this.dpr);
    resetToScreen(this.overlayCtx, this.dpr);
    this.requestRender();
  }

  destroy(): void {
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.resize);
  }
}
