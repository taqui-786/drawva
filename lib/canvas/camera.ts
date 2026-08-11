import { CameraState, MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM, Point, ViewportBounds, CANVAS_SIZE } from "./types";

export class Camera {
  public x: number = CANVAS_SIZE / 2;
  public y: number = CANVAS_SIZE / 2;
  public zoom: number = DEFAULT_ZOOM;
  public viewportWidth: number = 1920;
  public viewportHeight: number = 1080;

  constructor(initialZoom: number = DEFAULT_ZOOM) {
    this.zoom = initialZoom;
  }

  public setViewportSize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  public getState(): CameraState {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  public setState(state: Partial<CameraState>): void {
    if (state.x !== undefined) this.x = state.x;
    if (state.y !== undefined) this.y = state.y;
    if (state.zoom !== undefined) {
      this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.zoom));
    }
  }

  public screenToWorld(screenPoint: Point): Point {
    const worldX = (screenPoint.x - this.viewportWidth / 2) / this.zoom + this.x;
    const worldY = (screenPoint.y - this.viewportHeight / 2) / this.zoom + this.y;
    return { x: worldX, y: worldY, pressure: screenPoint.pressure };
  }

  public worldToScreen(worldPoint: Point): Point {
    const screenX = (worldPoint.x - this.x) * this.zoom + this.viewportWidth / 2;
    const screenY = (worldPoint.y - this.y) * this.zoom + this.viewportHeight / 2;
    return { x: screenX, y: screenY, pressure: worldPoint.pressure };
  }

  public panBy(deltaX: number, deltaY: number): void {
    this.x -= deltaX / this.zoom;
    this.y -= deltaY / this.zoom;
    this.clampPosition();
  }

  public zoomAt(screenPoint: Point, zoomFactor: number): void {
    const worldBefore = this.screenToWorld(screenPoint);
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * zoomFactor));
    if (newZoom === this.zoom) return;

    this.zoom = newZoom;
    const worldAfter = this.screenToWorld(screenPoint);
    this.x += worldBefore.x - worldAfter.x;
    this.y += worldBefore.y - worldAfter.y;
    this.clampPosition();
  }

  public clampPosition(): void {
    const margin = 500;
    this.x = Math.max(-margin, Math.min(CANVAS_SIZE + margin, this.x));
    this.y = Math.max(-margin, Math.min(CANVAS_SIZE + margin, this.y));
  }

  public getViewportWorldBounds(): ViewportBounds {
    const halfWidth = this.viewportWidth / (2 * this.zoom);
    const halfHeight = this.viewportHeight / (2 * this.zoom);
    return {
      minX: this.x - halfWidth,
      minY: this.y - halfHeight,
      maxX: this.x + halfWidth,
      maxY: this.y + halfHeight,
    };
  }
}
