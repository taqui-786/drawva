import {
  INITIAL_VIEW_ZOOM,
  MAX_SCALE,
  MIN_SCALE,
  SIZE,
  ZOOM_IN_FACTOR,
  ZOOM_OUT_FACTOR,
} from "./constants";
import type { CameraState, Point, Rect } from "./types";

export class Camera {
  private state: CameraState = { panX: 0, panY: 0, scale: 1 };
  private viewport: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private initialized = false;

  setViewport(cssWidth: number, cssHeight: number): CameraState {
    this.viewport = { x: 0, y: 0, w: cssWidth, h: cssHeight };
    if (
      !this.initialized &&
      cssWidth > 0 &&
      cssHeight > 0 &&
      Number.isFinite(cssWidth) &&
      Number.isFinite(cssHeight)
    ) {
      // penecho canvas-runtime.js fit() — initial scale centers SIZE inside the
      // viewport at ~INITIAL_VIEW_ZOOM (1.5) of the "10 000 units fills the
      // longer screen edge" zoom level.
      this.state.scale = Math.max(
        MIN_SCALE,
        Math.min(2, (Math.max(cssWidth, cssHeight) / 10_000) * INITIAL_VIEW_ZOOM)
      );
      this.state.panX = (cssWidth - SIZE * this.state.scale) / 2;
      this.state.panY = (cssHeight - SIZE * this.state.scale) / 2;
      this.initialized = true;
    }
    return this.state;
  }

  get scale(): number {
    return this.state.scale;
  }

  get panX(): number {
    return this.state.panX;
  }

  get panY(): number {
    return this.state.panY;
  }

  get viewportRect(): Rect {
    return this.viewport;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /** Cursor-relative zoom, factor = 1.12|0.89, clamped [0.03, 4] like penecho. */
  zoomAt(clientX: number, clientY: number, deltaY: number): void {
    const factor = deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.state.scale * factor));
    const px = clientX;
    const py = clientY;
    this.state.panX = px - ((px - this.state.panX) * next) / this.state.scale;
    this.state.panY = py - ((py - this.state.panY) * next) / this.state.scale;
    this.state.scale = next;
  }

  /** 2-pointer pinch zoom anchored at the gesture center. */
  pinchZoom(
    centerCss: Point,
    startCenterCss: Point,
    startDistance: number,
    currentDistance: number,
    startScale: number,
    startPanX: number,
    startPanY: number
  ): void {
    if (startDistance <= 0 || currentDistance <= 0) return;
    const next = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, (startScale * currentDistance) / startDistance)
    );
    const anchorX = (startCenterCss.x - startPanX) / startScale;
    const anchorY = (startCenterCss.y - startPanY) / startScale;
    this.state.scale = next;
    this.state.panX = centerCss.x - anchorX * next;
    this.state.panY = centerCss.y - anchorY * next;
  }

  panBy(dx: number, dy: number): void {
    this.state.panX += dx;
    this.state.panY += dy;
  }

  /** Re-center the board using the initial-fit math (used by the Reset button). */
  reset(): void {
    if (this.viewport.w <= 0 || this.viewport.h <= 0) return;
    this.state.scale = Math.max(
      MIN_SCALE,
      Math.min(2, (Math.max(this.viewport.w, this.viewport.h) / 10_000) * INITIAL_VIEW_ZOOM)
    );
    this.state.panX = (this.viewport.w - SIZE * this.state.scale) / 2;
    this.state.panY = (this.viewport.h - SIZE * this.state.scale) / 2;
  }

  screenToWorld(screenX: number, screenY: number): Point {
    return {
      x: (screenX - this.state.panX) / this.state.scale,
      y: (screenY - this.state.panY) / this.state.scale,
    };
  }

  worldToScreen(worldX: number, worldY: number): Point {
    return {
      x: worldX * this.state.scale + this.state.panX,
      y: worldY * this.state.scale + this.state.panY,
    };
  }

  /** World rect currently visible inside the viewport, clamped to [0, SIZE]. */
  visibleWorldRect(): Rect {
    const l = Math.max(0, -this.state.panX / this.state.scale);
    const t = Math.max(0, -this.state.panY / this.state.scale);
    const r = Math.min(SIZE, (this.viewport.w - this.state.panX) / this.state.scale);
    const b = Math.min(SIZE, (this.viewport.h - this.state.panY) / this.state.scale);
    return { x: l, y: t, w: Math.max(0, r - l), h: Math.max(0, b - t) };
  }

  /**
   * Apply penecho's per-layer transform: ctx.setTransform(d,0,0,d,0,0) then
   * translate(panX,panY) scale(scale). Used by engine render() and any module
   * that needs to draw in world space via native canvas paths.
   */
  applyWorldTransform(ctx: CanvasRenderingContext2D, dpr: number): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(this.state.panX, this.state.panY);
    ctx.scale(this.state.scale, this.state.scale);
  }
}
