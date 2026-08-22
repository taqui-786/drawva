import { Camera } from "./camera";
import { GRID_STEP, SIZE } from "./constants";
import { LayerStack, type LayerName } from "./layers";
import { TileCache } from "./tiles";
import type { Point, Rect } from "./types";

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: x2 - x, h: y2 - y };
}

export interface EnginePalette {
  outside: string;
  paper: string;
  paperGrid: string;
  border: string;
}

export function getThemePalette(isDark = false): EnginePalette {
  if (isDark) {
    return {
      outside: "#090a0f",
      paper: "#12141a",
      paperGrid: "rgba(255, 255, 255, 0.06)",
      border: "#232733",
    };
  }
  return {
    outside: "#eef0f3",
    paper: "#ffffff",
    paperGrid: "rgba(28, 31, 39, 0.07)",
    border: "#d9dde5",
  };
}

const DEFAULT_PALETTE: EnginePalette = getThemePalette(false);

type FrameListener = (engine: CanvasEngine) => void;

export class CanvasEngine {
  readonly camera = new Camera();
  readonly tiles = new TileCache();

  private root: HTMLDivElement;
  private layers: LayerStack;
  private dpr = 1;
  private renderQueued = false;
  private interactionQueued = false;
  private interactionDirty: Rect[] = [];
  private paintedCamera = "";
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;

  private preFrame = new Set<FrameListener>();
  private postFrame = new Set<FrameListener>();
  private interactionRenderers = new Set<(ctx: CanvasRenderingContext2D) => void>();

  palette: EnginePalette = { ...DEFAULT_PALETTE };
  gridVisible = true;

  draftActive = false;

  onTileWrite: ((tx: number, ty: number) => void) | null = null;
  onStrokeSegment: ((a: Point, b: Point, opts: { erase: boolean; size: number; color: string }) => void) | null = null;

  setPalette(palette: Partial<EnginePalette>): void {
    this.palette = { ...this.palette, ...palette };
    this.requestRender();
  }

  syncTheme(isDark: boolean): void {
    this.palette = getThemePalette(isDark);
    this.requestRender();
  }

  constructor(root: HTMLDivElement) {
    this.root = root;
    this.layers = new LayerStack(root);
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(root);
    this.fit();
  }

  onPreFrame(fn: FrameListener): () => void {
    this.preFrame.add(fn);
    return () => this.preFrame.delete(fn);
  }

  onPostFrame(fn: FrameListener): () => void {
    this.postFrame.add(fn);
    return () => this.postFrame.delete(fn);
  }

  onInteractionFrame(fn: (ctx: CanvasRenderingContext2D) => void): () => void {
    this.interactionRenderers.add(fn);
    return () => this.interactionRenderers.delete(fn);
  }

  canvas(name: LayerName): HTMLCanvasElement {
    return this.layers.canvas(name);
  }

  noteTileWrite(tx: number, ty: number): void {
    this.onTileWrite?.(tx, ty);
  }

  setTileWriteHook(fn: ((tx: number, ty: number) => void) | null): void {
    this.onTileWrite = fn;
  }

  setStrokeSegmentHook(
    fn: ((a: Point, b: Point, opts: { erase: boolean; size: number; color: string }) => void) | null
  ): void {
    this.onStrokeSegment = fn;
  }

  ctx(name: LayerName): CanvasRenderingContext2D {
    return this.layers.ctx(name);
  }

  fit(): void {
    const rect = this.root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.dpr = window.devicePixelRatio || 1;
    this.layers.resize(rect.width, rect.height, this.dpr);
    this.camera.setViewport(rect.width, rect.height);
    this.requestRender();
  }

  requestRender(): void {
    if (this.destroyed || this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      if (!this.destroyed) this.render();
    });
  }

  private cameraKey(): string {
    const c = this.camera;
    return `${c.panX}|${c.panY}|${c.scale}|${this.dpr}`;
  }

  private render(): void {
    this.forEachPreFrame();
    this.interactionDirty.length = 0;

    const rect = this.root.getBoundingClientRect();
    const d = this.dpr;
    const cam = this.camera;

    const ctx = this.ctx("screen");
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = this.palette.outside;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(cam.panX, cam.panY);
    ctx.scale(cam.scale, cam.scale);

    ctx.fillStyle = this.palette.paper;
    ctx.fillRect(0, 0, SIZE, SIZE);

    const visible = cam.visibleWorldRect();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SIZE, SIZE);
    ctx.clip();

    if (this.gridVisible) {
      ctx.strokeStyle = this.palette.paperGrid;
      ctx.lineWidth = 1 / cam.scale;
      ctx.beginPath();
      for (
        let x = Math.floor(visible.x / GRID_STEP) * GRID_STEP;
        x < visible.x + visible.w;
        x += GRID_STEP
      ) {
        ctx.moveTo(x, visible.y);
        ctx.lineTo(x, visible.y + visible.h);
      }
      for (
        let y = Math.floor(visible.y / GRID_STEP) * GRID_STEP;
        y < visible.y + visible.h;
        y += GRID_STEP
      ) {
        ctx.moveTo(visible.x, y);
        ctx.lineTo(visible.x + visible.w, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = this.palette.border;
    ctx.lineWidth = 2 / cam.scale;
    ctx.strokeRect(0, 0, SIZE, SIZE);
    ctx.restore();

    this.renderInkLayer(visible);
    this.renderInteractionLayer();
    this.paintedCamera = this.cameraKey();

    this.forEachPostFrame();
  }

  renderInkLayer(region: Rect | null = null): void {
    const d = this.dpr;
    const rect = this.root.getBoundingClientRect();
    const cam = this.camera;
    const visible = region ?? cam.visibleWorldRect();

    const inkCtx = this.ctx("ink");
    inkCtx.setTransform(d, 0, 0, d, 0, 0);
    inkCtx.clearRect(0, 0, rect.width, rect.height);
    if (visible.w <= 0 || visible.h <= 0) return;

    inkCtx.save();
    inkCtx.translate(cam.panX, cam.panY);
    inkCtx.scale(cam.scale, cam.scale);
    inkCtx.beginPath();
    inkCtx.rect(0, 0, SIZE, SIZE);
    inkCtx.clip();
    this.tiles.forTiles(visible, (canvas, tx, ty) => {
      inkCtx.drawImage(canvas, tx * 512, ty * 512);
    }, false);
    inkCtx.restore();
  }

  private renderInteractionLayer(): void {
    const d = this.dpr;
    const rect = this.root.getBoundingClientRect();
    const interactionCtx = this.ctx("interaction");
    interactionCtx.setTransform(d, 0, 0, d, 0, 0);
    interactionCtx.clearRect(0, 0, rect.width * d, rect.height * d);
    if (!this.interactionRenderers.size) return;
    interactionCtx.save();
    interactionCtx.translate(this.camera.panX, this.camera.panY);
    interactionCtx.scale(this.camera.scale, this.camera.scale);
    interactionCtx.beginPath();
    interactionCtx.rect(0, 0, SIZE, SIZE);
    interactionCtx.clip();
    for (const fn of this.interactionRenderers) fn(interactionCtx);
    interactionCtx.restore();
  }

  requestInteractionRender(worldRect?: Rect): void {
    if (!worldRect) {
      this.requestRender();
      return;
    }
    if (this.renderQueued || this.destroyed) return;
    const scale = this.camera.scale || 1;
    const pad = Math.max(16, Math.ceil(16 / scale));
    const padded: Rect = {
      x: worldRect.x - pad,
      y: worldRect.y - pad,
      w: worldRect.w + pad * 2,
      h: worldRect.h + pad * 2,
    };
    this.interactionDirty.push(padded);
    if (this.interactionQueued) return;
    this.interactionQueued = true;
    requestAnimationFrame(() => {
      this.interactionQueued = false;
      if (!this.destroyed) this.renderInteractionDirty();
    });
  }

  private renderInteractionDirty(): void {
    const dirty = this.interactionDirty;
    this.interactionDirty = [];
    if (!dirty.length) return;
    if (this.cameraKey() !== this.paintedCamera) {
      this.requestRender();
      return;
    }
    const rect = this.root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const d = this.dpr;
    let merged = dirty[0];
    for (let i = 1; i < dirty.length; i++) merged = unionRect(merged, dirty[i]);
    const c = this.camera;
    const sx = merged.x * c.scale + c.panX;
    const sy = merged.y * c.scale + c.panY;
    const ctx = this.ctx("interaction");

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(
      Math.floor(sx * d) - 2,
      Math.floor(sy * d) - 2,
      Math.ceil(merged.w * c.scale * d) + 4,
      Math.ceil(merged.h * c.scale * d) + 4
    );
    ctx.restore();

    if (!this.interactionRenderers.size) {
      this.paintedCamera = this.cameraKey();
      return;
    }
    ctx.save();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.translate(c.panX, c.panY);
    ctx.scale(c.scale, c.scale);
    ctx.beginPath();
    ctx.rect(merged.x, merged.y, merged.w, merged.h);
    ctx.clip();
    for (const fn of this.interactionRenderers) fn(ctx);
    ctx.restore();
    this.paintedCamera = this.cameraKey();
  }

  visibleRect(): Rect {
    return this.camera.visibleWorldRect();
  }

  screenToWorld(screenX: number, screenY: number): Point {
    const rect = this.root.getBoundingClientRect();
    return this.camera.screenToWorld(screenX - rect.left, screenY - rect.top);
  }

  worldToScreen(worldX: number, worldY: number): Point {
    const rect = this.root.getBoundingClientRect();
    const p = this.camera.worldToScreen(worldX, worldY);
    return { x: p.x + rect.left, y: p.y + rect.top };
  }

  get rootElement(): HTMLDivElement {
    return this.root;
  }

  get cssWidth(): number {
    return this.root.getBoundingClientRect().width;
  }

  get cssHeight(): number {
    return this.root.getBoundingClientRect().height;
  }

  get currentDpr(): number {
    return this.dpr;
  }

  private forEachPreFrame(): void {
    for (const fn of this.preFrame) fn(this);
  }

  private forEachPostFrame(): void {
    for (const fn of this.postFrame) fn(this);
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.layers.destroy();
    this.tiles.clear();
    this.preFrame.clear();
    this.postFrame.clear();
  }
}
