import { MAX_ZOOM, MIN_ZOOM } from "@canvas/constants/defaults";
import type { Camera, CanvasSize, Point } from "@/canvas/model/types";
import type { Rect } from "@canvas/geometry/rectangle";

/**
 * Camera converts between screen (CSS px relative to canvas) and scene
 * coordinates (§16). Conceptually the camera x/y is the scene coordinate that
 * appears at the viewport's top-left.
 */
export class CameraController {
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private size: CanvasSize = { width: 0, height: 0 };

  get(): Camera {
    return this.camera;
  }

  setViewportSize(size: CanvasSize): void {
    this.size = size;
  }

  setCamera(next: Partial<Camera>): void {
    this.camera = { ...this.camera, ...next };
    this.camera.zoom = clampZoom(this.camera.zoom);
  }

  screenToScene(screen: Point): Point {
    return [
      screen[0] / this.camera.zoom + this.camera.x,
      screen[1] / this.camera.zoom + this.camera.y,
    ];
  }

  sceneToScreen(scene: Point): Point {
    return [
      (scene[0] - this.camera.x) * this.camera.zoom,
      (scene[1] - this.camera.y) * this.camera.zoom,
    ];
  }

  /** Viewport-sized rect in scene space — used for culling + grid (§17). */
  visibleSceneRect(): Rect {
    return {
      x: this.camera.x,
      y: this.camera.y,
      width: this.size.width / this.camera.zoom,
      height: this.size.height / this.camera.zoom,
    };
  }

  panByScreenDelta(dx: number, dy: number): void {
    this.camera.x -= dx / this.camera.zoom;
    this.camera.y -= dy / this.camera.zoom;
  }

  /**
   * Zoom while keeping the scene point under `screenAnchor` stationary (§18).
   */
  zoomAt(screenAnchor: Point, factor: number): void {
    const before = this.screenToScene(screenAnchor);
    this.camera.zoom = clampZoom(this.camera.zoom * factor);
    const after = this.screenToScene(screenAnchor);
    this.camera.x += before[0] - after[0];
    this.camera.y += before[1] - after[1];
  }

  setZoomAtCenter(nextZoom: number): void {
    this.zoomAt([this.size.width / 2, this.size.height / 2], nextZoom / this.camera.zoom);
  }

  resetZoom(): void {
    this.setZoomAtCenter(1);
  }

  /** Fit a scene-space rect into the viewport with padding in px (§83). */
  zoomToRect(rect: Rect, padding = 60): void {
    if (this.size.width <= 0 || this.size.height <= 0) return;
    const w = Math.max(rect.width, 1e-6);
    const h = Math.max(rect.height, 1e-6);
    const zoomX = (this.size.width - padding * 2) / w;
    const zoomY = (this.size.height - padding * 2) / h;
    const zoom = clampZoom(Math.min(zoomX, zoomY, 1));
    this.camera.zoom = zoom;
    this.camera.x = rect.x + rect.width / 2 - this.size.width / (2 * zoom);
    this.camera.y = rect.y + rect.height / 2 - this.size.height / (2 * zoom);
  }
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
