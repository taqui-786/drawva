// ============================================================
// Drawva Canvas Engine — Camera
// Pure math, no DOM. These are the ONLY coordinate conversion
// functions in the whole codebase — never inline the math.
// ============================================================

import type { CameraState, Point, Rect } from "./types";

export const CAMERA_MIN_SCALE = 0.03;
export const CAMERA_MAX_SCALE = 4.0;

export class Camera {
  scale: number;
  panX: number;
  panY: number;

  constructor(state: CameraState = { scale: 1, panX: 0, panY: 0 }) {
    this.scale = state.scale;
    this.panX = state.panX;
    this.panY = state.panY;
  }

  /** World → screen */
  worldToScreen(p: Point): Point {
    return {
      x: this.panX + p.x * this.scale,
      y: this.panY + p.y * this.scale,
    };
  }

  /** Screen → world */
  screenToWorld(p: Point): Point {
    return {
      x: (p.x - this.panX) / this.scale,
      y: (p.y - this.panY) / this.scale,
    };
  }

  /** Zoom centred on a screen point. factor > 1 zooms in. */
  zoomAtPoint(screenX: number, screenY: number, factor: number): void {
    const worldX = (screenX - this.panX) / this.scale;
    const worldY = (screenY - this.panY) / this.scale;

    const newScale = clamp(this.scale * factor, CAMERA_MIN_SCALE, CAMERA_MAX_SCALE);
    this.panX = screenX - worldX * newScale;
    this.panY = screenY - worldY * newScale;
    this.scale = newScale;

    this.assertFinite();
  }

  /** Pan by delta in screen pixels */
  pan(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
  }

  /**
   * Set camera so that the given world rect fills the viewport
   * (with padding ratio). viewportW/H are in CSS pixels.
   */
  fitBounds(rect: Rect, viewportW: number, viewportH: number, padding = 0.1): void {
    if (rect.w <= 0 || rect.h <= 0) return;

    const padW = viewportW * padding;
    const padH = viewportH * padding;
    const fitW = (viewportW - padW * 2) / rect.w;
    const fitH = (viewportH - padH * 2) / rect.h;
    const newScale = clamp(Math.min(fitW, fitH), CAMERA_MIN_SCALE, CAMERA_MAX_SCALE);

    this.scale = newScale;
    this.panX = viewportW / 2 - (rect.x + rect.w / 2) * newScale;
    this.panY = viewportH / 2 - (rect.y + rect.h / 2) * newScale;
    this.assertFinite();
  }

  /** Returns the visible world rect for the given viewport dimensions */
  visibleWorldRect(viewportW: number, viewportH: number): Rect {
    const tl = this.screenToWorld({ x: 0, y: 0 });
    const br = this.screenToWorld({ x: viewportW, y: viewportH });
    return {
      x: tl.x,
      y: tl.y,
      w: br.x - tl.x,
      h: br.y - tl.y,
    };
  }

  toState(): CameraState {
    return { scale: this.scale, panX: this.panX, panY: this.panY };
  }

  /** Reset to identity */
  reset(): void {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
  }

  private assertFinite(): void {
    if (!isFinite(this.scale) || !isFinite(this.panX) || !isFinite(this.panY)) {
      console.error("[Camera] Non-finite state — resetting", { scale: this.scale, panX: this.panX, panY: this.panY });
      this.reset();
    }
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}
