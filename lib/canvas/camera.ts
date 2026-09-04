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

  handleWheel(e: { clientX: number; clientY: number; deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean; deltaMode?: number }): void {
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = Math.pow(0.997, e.deltaY);
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.state.scale * zoomFactor));
      const px = e.clientX;
      const py = e.clientY;
      this.state.panX = px - ((px - this.state.panX) * next) / this.state.scale;
      this.state.panY = py - ((py - this.state.panY) * next) / this.state.scale;
      this.state.scale = next;
    } else if (Math.abs(e.deltaX) > 0 || (e.deltaMode === 0 && Math.abs(e.deltaY) < 60)) {
      this.state.panX -= e.deltaX;
      this.state.panY -= e.deltaY;
    } else {
      this.zoomAt(e.clientX, e.clientY, e.deltaY);
    }
  }

  zoomAt(clientX: number, clientY: number, deltaY: number): void {
    const factor = deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.state.scale * factor));
    const px = clientX;
    const py = clientY;
    this.state.panX = px - ((px - this.state.panX) * next) / this.state.scale;
    this.state.panY = py - ((py - this.state.panY) * next) / this.state.scale;
    this.state.scale = next;
  }

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

  centerOnBox(box: Rect, padding = 80): void {
    if (this.viewport.w <= 0 || this.viewport.h <= 0) return;
    const targetScale = Math.max(
      MIN_SCALE,
      Math.min(
        1.5,
        Math.min(
          (this.viewport.w - padding * 2) / Math.max(10, box.w),
          (this.viewport.h - padding * 2) / Math.max(10, box.h)
        )
      )
    );
    const centerX = box.x + box.w / 2;
    const centerY = box.y + box.h / 2;
    this.state.scale = targetScale;
    this.state.panX = this.viewport.w / 2 - centerX * targetScale;
    this.state.panY = this.viewport.h / 2 - centerY * targetScale;
  }

  visibleWorldRect(): Rect {
    const l = Math.max(0, -this.state.panX / this.state.scale);
    const t = Math.max(0, -this.state.panY / this.state.scale);
    const r = Math.min(SIZE, (this.viewport.w - this.state.panX) / this.state.scale);
    const b = Math.min(SIZE, (this.viewport.h - this.state.panY) / this.state.scale);
    return { x: l, y: t, w: Math.max(0, r - l), h: Math.max(0, b - t) };
  }
}

