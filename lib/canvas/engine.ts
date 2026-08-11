// ============================================================
// Drawva Canvas Engine — Main Orchestrator
// Wires: camera + tiles + layers + tools + rAF loop + events
// Zero React imports. The Editor/API is the only public surface.
// ============================================================

import { Camera, CAMERA_MAX_SCALE, CAMERA_MIN_SCALE } from "./camera";
import { TileMap, TILE, WORLD_SIZE } from "./tiles";
import { createLayers, type Layers } from "./layers";
import { UndoStack } from "./undo";
import { StrokeTool } from "./strokes";
import { EraserTool } from "./eraser";
import { LassoSelectTool } from "./selection";
import { TextTool } from "./textTool";
import { ShapeTool, type ShapeType } from "./shapes";
import { ImageImporter } from "./images";
import { Persistence } from "./persistence";
import { exportPng, copyToClipboard } from "./exportPng";
import { CommandExecutor, type CommandExecutorCallbacks } from "./commands";
import type { CanvasItem, EngineEventMap, ShapeItem, TextItem, ImageItem, ToolName, Rect } from "./types";

// ── Simple typed event emitter ─────────────────────────────

type Listener<T> = (data: T) => void;

class Emitter {
  private map = new Map<string, Listener<unknown>[]>();

  on<K extends keyof EngineEventMap>(
    event: K,
    fn: Listener<EngineEventMap[K]>
  ): () => void {
    if (!this.map.has(event)) this.map.set(event, []);
    this.map.get(event)!.push(fn as Listener<unknown>);
    return () => this.off(event, fn);
  }

  off<K extends keyof EngineEventMap>(
    event: K,
    fn: Listener<EngineEventMap[K]>
  ): void {
    const fns = this.map.get(event);
    if (!fns) return;
    const i = fns.indexOf(fn as Listener<unknown>);
    if (i >= 0) fns.splice(i, 1);
  }

  emit<K extends keyof EngineEventMap>(event: K, data: EngineEventMap[K]): void {
    this.map.get(event)?.forEach((fn) => {
      try { fn(data); } catch { /* don't break the engine */ }
    });
  }
}

// ── Grid drawing ───────────────────────────────────────────

function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  cssW: number,
  cssH: number,
  dpr: number
): void {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  // Paper background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssW, cssH);

  const gridSize = camera.scale < 0.2 ? TILE : camera.scale < 1 ? 128 : 64;
  const screenGridSize = gridSize * camera.scale;

  if (screenGridSize < 4) {
    ctx.restore();
    return;
  }

  ctx.strokeStyle = camera.scale < 0.5 ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.08)";
  ctx.lineWidth = 0.5;

  // Offset in screen space
  const offsetX = ((camera.panX % screenGridSize) + screenGridSize) % screenGridSize;
  const offsetY = ((camera.panY % screenGridSize) + screenGridSize) % screenGridSize;

  ctx.beginPath();
  for (let x = offsetX; x <= cssW; x += screenGridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssH);
  }
  for (let y = offsetY; y <= cssH; y += screenGridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(cssW, y);
  }
  ctx.stroke();
  ctx.restore();
}

// ── Item rendering ─────────────────────────────────────────

const globalImageCache = new Map<string, HTMLImageElement>();

function getOrLoadImage(src: string, requestRender: () => void): HTMLImageElement | null {
  if (globalImageCache.has(src)) {
    const cached = globalImageCache.get(src)!;
    return cached.complete && cached.naturalWidth > 0 ? cached : null;
  }
  const img = new Image();
  img.onload = () => requestRender();
  img.src = src;
  globalImageCache.set(src, img);
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * Projection used by item rendering. `toScreen` maps a world point to the
 * current canvas's coordinate system. `scale` is the world-to-canvas scale.
 * Items live in world space; this indirection lets us reuse the same drawing
 * code for both the live engine canvas and the offline atlas canvas.
 */
export interface ItemProjection {
  toScreen(p: { x: number; y: number }): { x: number; y: number };
  scale: number;
}

function projectFromCamera(camera: Camera): ItemProjection {
  return {
    toScreen: (p) => camera.worldToScreen(p),
    scale: camera.scale,
  };
}

/** Draw items (text / shape / image) onto `ctx` using a world→canvas projection. */
export function drawItems(
  ctx: CanvasRenderingContext2D,
  items: CanvasItem[],
  proj: ItemProjection,
  requestRender: () => void
): void {
  for (const item of items) {
    const tl = proj.toScreen({ x: item.x, y: item.y });

    if (item.kind === "text") {
      const ti = item as TextItem;
      let drawn = false;

      if (ti.imageDataUrl) {
        const img = getOrLoadImage(ti.imageDataUrl, requestRender);
        if (img) {
          const sw = ti.width * proj.scale;
          const sh = ti.height * proj.scale;
          ctx.drawImage(img, tl.x, tl.y, sw, sh);
          drawn = true;
        }
      }

      if (!drawn) {
        // Direct text rendering fallback
        ctx.save();
        ctx.font = `${Math.max(10, ti.fontSize * proj.scale)}px sans-serif`;
        ctx.fillStyle = ti.color;
        ctx.textBaseline = "top";
        const lines = ti.text.split("\n");
        const lh = ti.fontSize * proj.scale * 1.4;
        lines.forEach((line, i) => {
          ctx.fillText(line, tl.x, tl.y + i * lh);
        });
        ctx.restore();
      }
    } else if (item.kind === "shape") {
      const si = item as ShapeItem;
      ctx.save();
      ctx.strokeStyle = si.color;
      ctx.lineWidth = Math.max(1, si.strokeWidth * proj.scale);
      ctx.fillStyle = si.fill ?? "transparent";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (si.type === "rect") {
        const sw = si.w * proj.scale;
        const sh = si.h * proj.scale;
        ctx.beginPath();
        ctx.rect(tl.x, tl.y, sw, sh);
        if (si.fill && si.fill !== "transparent") ctx.fill();
        ctx.stroke();
      } else if (si.type === "ellipse") {
        const sw = si.w * proj.scale;
        const sh = si.h * proj.scale;
        ctx.beginPath();
        ctx.ellipse(tl.x + sw / 2, tl.y + sh / 2, Math.abs(sw / 2), Math.abs(sh / 2), 0, 0, Math.PI * 2);
        if (si.fill && si.fill !== "transparent") ctx.fill();
        ctx.stroke();
      } else if (si.type === "arrow" || si.type === "line") {
        const p1 = si.x1 !== undefined && si.y1 !== undefined
          ? proj.toScreen({ x: si.x1, y: si.y1 })
          : tl;
        const p2 = si.x2 !== undefined && si.y2 !== undefined
          ? proj.toScreen({ x: si.x2, y: si.y2 })
          : proj.toScreen({ x: si.x + si.w, y: si.y + si.h });

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        if (si.type === "arrow") {
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const aSize = Math.max(8, si.strokeWidth * proj.scale * 4);
          ctx.beginPath();
          ctx.moveTo(p2.x, p2.y);
          ctx.lineTo(
            p2.x - aSize * Math.cos(angle - Math.PI / 6),
            p2.y - aSize * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            p2.x - aSize * Math.cos(angle + Math.PI / 6),
            p2.y - aSize * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fillStyle = si.color;
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (item.kind === "image") {
      const ii = item as ImageItem;
      const sw = ii.w * proj.scale;
      const sh = ii.h * proj.scale;
      const img = getOrLoadImage(ii.src, requestRender);
      if (img) {
        ctx.drawImage(img, tl.x, tl.y, sw, sh);
      } else {
        // Draw placeholder rectangle while image is loading
        ctx.save();
        ctx.strokeStyle = "rgba(156,163,175,0.6)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(tl.x, tl.y, sw, sh);
        ctx.restore();
      }
    } else if (item.kind === "widget") {
      const wi = item as unknown as {
        x: number;
        y: number;
        w: number;
        h: number;
        payload?: string;
        source?: string;
        copyText?: string;
        title?: string;
        _preloadedImg?: HTMLImageElement;
      };
      const sw = Math.max(160, wi.w) * proj.scale;
      const sh = Math.max(100, wi.h) * proj.scale;

      if (wi._preloadedImg) {
        ctx.drawImage(wi._preloadedImg, tl.x, tl.y, sw, sh);
      } else {
        const htmlContent = wi.payload || "";
        if (htmlContent) {
          // Render actual live HTML UI into snapshot canvas via SVG foreignObject
          const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(sw)}" height="${Math.round(sh)}">
            <foreignObject width="100%" height="100%">
              <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;box-sizing:border-box;">
                ${htmlContent}
              </div>
            </foreignObject>
          </svg>`;
          const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
          const img = getOrLoadImage(svgUrl, requestRender);
          if (img) {
            ctx.drawImage(img, tl.x, tl.y, sw, sh);
          }
        }
      }
    }
  }
}

function renderItems(
  ctx: CanvasRenderingContext2D,
  items: CanvasItem[],
  camera: Camera,
  cssW: number,
  cssH: number,
  dpr: number,
  requestRender: () => void
): void {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawItems(ctx, items, projectFromCamera(camera), requestRender);
  ctx.restore();
}

// ── Main Engine ─────────────────────────────────────────────

export class CanvasEngine {
  readonly camera: Camera;
  readonly tiles: TileMap;
  readonly layers: Layers;
  readonly undoStack: UndoStack;
  readonly emitter: Emitter;

  private items: CanvasItem[] = [];
  private activeTool: ToolName = "pen";
  private color = "#1a1a1a";
  private brushSize = 3;
  private showGrid = true;

  // Tools
  readonly strokeTool: StrokeTool;
  readonly eraserTool: EraserTool;
  readonly lassoTool: LassoSelectTool;
  readonly textTool: TextTool;
  readonly shapeTool: ShapeTool;
  readonly imageImporter: ImageImporter;
  readonly persistence: Persistence;
  readonly commandExecutor: CommandExecutor;

  // rAF state
  private renderQueued = false;
  private rafHandle: number | null = null;
  private destroyed = false;

  // Pan state
  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private panCamera = { x: 0, y: 0 };
  private spaceDown = false;
  private panPointerId: number | null = null;

  // Pinch state
  private pinchPointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist = 0;

  // Image preload cache for rendering
  private imgCache = new Map<string, HTMLImageElement>();

  // onCommit callback (triggers autosave)
  private onCommit: () => void;

  // Container for text overlay
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.camera = new Camera({ scale: 1, panX: 0, panY: 0 });
    this.tiles = new TileMap();
    this.layers = createLayers(container);
    this.undoStack = new UndoStack();
    this.emitter = new Emitter();

    this.onCommit = () => {
      this.scheduleAutosave();
    };

    this.strokeTool = new StrokeTool(
      this.camera,
      this.tiles,
      this.layers,
      this.undoStack,
      () => this.requestRender(),
      this.onCommit
    );

    this.eraserTool = new EraserTool(
      this.camera,
      this.tiles,
      this.layers,
      this.undoStack,
      () => this.requestRender(),
      this.onCommit,
      () => this.items
    );

    this.lassoTool = new LassoSelectTool(
      this.camera,
      this.tiles,
      this.layers,
      this.undoStack,
      () => this.requestRender(),
      () => this.items,
      (items) => { this.items = items; },
      this.onCommit
    );

    this.textTool = new TextTool(
      container,
      this.camera,
      (item) => this.addItem(item),
      () => { /* cancelled */ }
    );

    this.shapeTool = new ShapeTool(
      this.camera,
      this.layers,
      (item) => this.addItem(item)
    );

    this.imageImporter = new ImageImporter(
      this.camera,
      (item) => {
        this.preloadImage(item.src);
        this.addItem(item);
      },
      (err) => {
        console.error("[CanvasEngine] Image import failed:", err);
      }
    );

    this.persistence = new Persistence("default");

    const callbacks: CommandExecutorCallbacks = {
      addTextItem: (x, y, text, fontSize) => {
        this.textTool.setColor(this.color);
        // Create item directly
        const item: TextItem = {
          id: `text_cmd_${Date.now()}`,
          kind: "text",
          x, y, text, fontSize,
          color: this.color,
          width: text.length * fontSize * 0.6,
          height: fontSize * 1.4,
        };
        this.items = [...this.items, item];
        this.requestRender();
      },
      addShapeItem: (type, x, y, w, h) => {
        const item: ShapeItem = {
          id: `shape_cmd_${Date.now()}`,
          kind: "shape",
          type, x, y, w, h,
          color: this.color,
          strokeWidth: this.brushSize,
          fill: "transparent",
        };
        this.items = [...this.items, item];
        this.requestRender();
      },
      eraseRect: (x, y, w, h) => {
        const rect = { x, y, w, h };
        const before = this.tiles.snapshotRect(rect);
        this.tiles.forTilesInRect(rect, (tile, tx, ty) => {
          tile.ctx.clearRect(x - tx * TILE, y - ty * TILE, w, h);
          tile.dirty = true;
        });
        const byteSize = before.reduce((a, t) => a + t.data.data.byteLength, 0);
        this.undoStack.push({ tilesBefore: before, tilesAfter: [], itemsBefore: this.items, itemsAfter: this.items, byteSize });
        this.requestRender();
      },
      addDraftWidget: (x, y, w, h, title, html) => {
        console.info("[CanvasEngine] Draft widget added:", { x, y, w, h, title });
        // TODO: Phase 7 — render on draftLayer with accept/discard controls
        const item: CanvasItem = {
          id: `widget_${Date.now()}`,
          kind: "widget",
          x, y, w, h,
          widgetKind: "html",
          payload: html,
          title,
        };
        this.items = [...this.items, item];
        this.requestRender();
      },
    };

    this.commandExecutor = new CommandExecutor(callbacks);

    this.bindEvents();
    this.initPersistence();

    // Listen for resize
    container.addEventListener("canvas-resize", (e) => {
      const detail = (e as CustomEvent).detail as { w: number; h: number; dpr: number };
      this.tiles.setDpr(detail.dpr);
      this.requestRender();
    });
  }

  // ── Persistence ─────────────────────────────────────────

  private async initPersistence(): Promise<void> {
    await this.persistence.init();
    if (!this.persistence.isAvailable) {
      console.warn("[CanvasEngine] Running in memory-only mode (IndexedDB unavailable)");
    }
    await this.loadFromDB();
  }

  private async loadFromDB(): Promise<void> {
    const result = await this.persistence.load();
    if (!result) return;

    // Load tiles
    for (const [key, blob] of result.tiles) {
      const [tx, ty] = key.split(",").map(Number);
      await this.tiles.fromBlob(tx, ty, blob);
    }

    // Load items
    this.items = result.items;

    // Restore camera
    if (result.camera) {
      this.camera.scale = result.camera.scale;
      this.camera.panX = result.camera.panX;
      this.camera.panY = result.camera.panY;
    }

    this.requestRender();
  }

  private scheduleAutosave(): void {
    this.persistence.scheduleAutosave(() => ({
      docId: "default",
      tiles: new Map(
        this.tiles.keys().map((k) => {
          const [tx, ty] = k.split(",").map(Number);
          const tile = this.tiles.get(tx, ty, false);
          return [k, tile!.canvas] as [string, HTMLCanvasElement];
        })
      ),
      items: this.items,
      camera: this.camera.toState(),
    }));
  }

  // ── rAF Render Loop ─────────────────────────────────────

  requestRender(): void {
    if (this.renderQueued || this.destroyed) return;
    this.renderQueued = true;
    this.rafHandle = requestAnimationFrame(() => {
      this.renderQueued = false;
      if (!this.destroyed) {
        try {
          this.render();
          this.emitter.emit("cameraChanged", this.camera.toState());
        } catch (err) {
          console.error("[CanvasEngine] Render error:", err);
        }
      }
    });
  }

  private render(): void {
    const { camera, layers } = this;
    const { dpr, cssWidth: w, cssHeight: h } = layers;

    // 1. Paper + grid
    if (this.showGrid) {
      drawGrid(layers.paperCtx, camera, w, h, dpr);
    } else {
      layers.paperCtx.save();
      layers.paperCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layers.paperCtx.fillStyle = "#ffffff";
      layers.paperCtx.fillRect(0, 0, w, h);
      layers.paperCtx.restore();
    }

    // 2. Tile layer — confirmed ink (storage mirror; primary visible
    //    surface is inkLayer so strokes paint on top of widgets).
    const tileCtx = layers.tileCtx;
    tileCtx.save();
    tileCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tileCtx.clearRect(0, 0, w, h);
    tileCtx.translate(camera.panX, camera.panY);
    tileCtx.scale(camera.scale, camera.scale);

    const visible = camera.visibleWorldRect(w, h);
    this.tiles.forTilesInRect(visible, (tile, tx, ty) => {
      tileCtx.drawImage(tile.canvas, 0, 0, tile.canvas.width, tile.canvas.height, tx * TILE, ty * TILE, TILE, TILE);
    });
    tileCtx.restore();

    // 3. Object layer (items: text, shapes, images) — render to tileCtx
    //    so they stay anchored to world space and below live ink.
    renderItems(layers.tileCtx, this.items, camera, w, h, dpr, () => this.requestRender());

    // 4. Ink layer — confirmed ink painted here so committed strokes
    //    appear on top of widgets (PenEcho-style: ink above widget-
    //    layer). Live pen preview lives on liveInkLayer above this so
    //    clearing the live preview doesn't erase committed ink.
    const inkCtx = layers.inkCtx;
    inkCtx.save();
    inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    inkCtx.clearRect(0, 0, w, h);
    inkCtx.translate(camera.panX, camera.panY);
    inkCtx.scale(camera.scale, camera.scale);
    this.tiles.forTilesInRect(visible, (tile, tx, ty) => {
      inkCtx.drawImage(tile.canvas, 0, 0, tile.canvas.width, tile.canvas.height, tx * TILE, ty * TILE, TILE, TILE);
    });
    inkCtx.restore();

    // 5. Update text overlay position
    if (this.textTool.isEditing) {
      this.textTool.updateCameraTransform();
    }
  }

  // ── Event Binding ────────────────────────────────────────

  private bindEvents(): void {
    const el = this.layers.interactionLayer;

    el.addEventListener("pointerdown", this.handlePointerDown);
    el.addEventListener("pointermove", this.handlePointerMove);
    el.addEventListener("pointerup", this.handlePointerUp);
    el.addEventListener("pointercancel", this.handlePointerCancel);
    el.addEventListener("wheel", this.handleWheel, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("beforeunload", this.handleBeforeUnload);

    // Drag and drop on the container
    this.container.addEventListener("dragover", (e) => e.preventDefault());
    this.container.addEventListener("drop", (e) => {
      e.preventDefault();
      this.imageImporter.handleDrop(e as DragEvent);
    });

    // Paste
    window.addEventListener("paste", (e) => {
      if (this.activeTool === "image") {
        this.imageImporter.handlePaste(
          e as ClipboardEvent,
          this.layers.cssWidth,
          this.layers.cssHeight
        );
      }
    });
  }

  private handlePointerDown = (e: PointerEvent) => {
    const el = this.layers.interactionLayer;

    // Two-finger pinch detection
    if (e.pointerType === "touch") {
      this.pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinchPointers.size === 2) {
        const pts = [...this.pinchPointers.values()];
        this.lastPinchDist = Math.hypot(
          pts[0].x - pts[1].x,
          pts[0].y - pts[1].y
        );
        // Cancel active stroke if second finger comes down
        this.strokeTool.cancel();
        this.eraserTool.cancel();
        return;
      }
    }

    // Middle mouse or space+left = pan
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.panCamera = { x: this.camera.panX, y: this.camera.panY };
      this.panPointerId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
      return;
    }

    switch (this.activeTool) {
      case "pen":
      case "highlighter":
        this.strokeTool.onPointerDown(e);
        break;
      case "eraser":
        this.eraserTool.onPointerDown(e);
        break;
      case "select":
        this.lassoTool.onPointerDown(e);
        break;
      case "text":
        this.textTool.startAt(e.offsetX, e.offsetY);
        break;
      case "rect":
      case "ellipse":
      case "arrow":
      case "line":
        this.shapeTool.onPointerDown(e);
        break;
      case "hand":
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY };
        this.panCamera = { x: this.camera.panX, y: this.camera.panY };
        this.panPointerId = e.pointerId;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = "grabbing";
        break;
      case "image":
        this.imageImporter.openFilePicker(this.layers.cssWidth, this.layers.cssHeight);
        break;
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    // Update pinch pointer
    if (e.pointerType === "touch" && this.pinchPointers.has(e.pointerId)) {
      this.pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pinchPointers.size === 2) {
        const pts = [...this.pinchPointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.lastPinchDist > 0) {
          const factor = dist / this.lastPinchDist;
          const mid = {
            x: (pts[0].x + pts[1].x) / 2,
            y: (pts[0].y + pts[1].y) / 2,
          };
          const rect = this.layers.interactionLayer.getBoundingClientRect();
          this.camera.zoomAtPoint(
            mid.x - rect.left,
            mid.y - rect.top,
            factor
          );
          this.requestRender();
        }
        this.lastPinchDist = dist;
        return;
      }
    }

    if (this.isPanning && e.pointerId === this.panPointerId) {
      const dx = e.clientX - this.panStart.x;
      const dy = e.clientY - this.panStart.y;
      this.camera.panX = this.panCamera.x + dx;
      this.camera.panY = this.panCamera.y + dy;
      this.requestRender();
      return;
    }

    switch (this.activeTool) {
      case "pen":
      case "highlighter":
        this.strokeTool.onPointerMove(e);
        break;
      case "eraser":
        this.eraserTool.onPointerMove(e);
        break;
      case "select":
        this.lassoTool.onPointerMove(e);
        break;
      case "rect":
      case "ellipse":
      case "arrow":
      case "line":
        this.shapeTool.onPointerMove(e);
        break;
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    this.pinchPointers.delete(e.pointerId);

    if (this.isPanning && e.pointerId === this.panPointerId) {
      this.isPanning = false;
      this.panPointerId = null;
      this.layers.interactionLayer.style.cursor = this.cursorForTool();
      return;
    }

    switch (this.activeTool) {
      case "pen":
      case "highlighter":
        this.strokeTool.onPointerUp(e);
        {
          const strokeRect = this.strokeTool.lastCommittedRect;
          if (strokeRect) {
            this.emitter.emit("strokeEnd", {
              tool: this.activeTool as "pen" | "highlighter",
              worldRect: strokeRect,
              points: this.strokeTool.lastCommittedPoints ?? [],
            });
          }
        }
        this.emitter.emit("canUndoChanged", this.undoStack.canUndo);
        break;
      case "eraser":
        this.eraserTool.onPointerUp(e);
        this.emitter.emit("canUndoChanged", this.undoStack.canUndo);
        break;
      case "select":
        this.lassoTool.onPointerUp(e);
        break;
      case "rect":
      case "ellipse":
      case "arrow":
      case "line":
        this.shapeTool.onPointerUp(e);
        this.emitter.emit("canUndoChanged", this.undoStack.canUndo);
        break;
    }
  };

  private handlePointerCancel = (e: PointerEvent) => {
    this.pinchPointers.delete(e.pointerId);

    if (this.isPanning && e.pointerId === this.panPointerId) {
      this.isPanning = false;
      this.panPointerId = null;
      return;
    }

    this.strokeTool.onPointerCancel(e);
    this.eraserTool.onPointerCancel(e);
    this.lassoTool.onPointerCancel(e);
    this.shapeTool.onPointerCancel(e);
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    this.camera.zoomAtPoint(e.offsetX, e.offsetY, factor);
    this.requestRender();
    this.emitter.emit("zoomChanged", this.camera.scale);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    // Skip if focus is in an input/textarea
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (e.code === "Space" && !this.spaceDown) {
      e.preventDefault();
      this.spaceDown = true;
      this.layers.interactionLayer.style.cursor = "grab";
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "y") {
      e.preventDefault();
      this.redo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "=") {
      e.preventDefault();
      this.zoomIn();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "-") {
      e.preventDefault();
      this.zoomOut();
    }
    if (e.key === "0") {
      this.fitContent();
    }
    if (e.key === "Escape") {
      this.lassoTool.onKeyDown(e);
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      this.lassoTool.onKeyDown(e);
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      this.spaceDown = false;
      this.layers.interactionLayer.style.cursor = this.cursorForTool();
    }
  };

  private handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      this.requestRender();
    } else {
      this.scheduleAutosave();
    }
  };

  private handleBeforeUnload = () => {
    this.persistence.flushAutosave(() => ({
      docId: "default",
      tiles: new Map(
        this.tiles.keys().map((k) => {
          const [tx, ty] = k.split(",").map(Number);
          const tile = this.tiles.get(tx, ty, false);
          return [k, tile!.canvas] as [string, HTMLCanvasElement];
        })
      ),
      items: this.items,
      camera: this.camera.toState(),
    }));
  };

  // ── Public API ──────────────────────────────────────────

  setTool(tool: ToolName): void {
    // Cancel any active operation when switching tools
    this.strokeTool.cancel();
    this.eraserTool.cancel();
    this.lassoTool.exit();
    this.shapeTool.cancel();
    if (this.textTool.isEditing) this.textTool.commit();

    this.activeTool = tool;

    // Configure sub-tools
    if (tool === "pen" || tool === "highlighter") {
      this.strokeTool.setTool(tool as "pen" | "highlighter");
    }
    if (tool === "rect" || tool === "ellipse" || tool === "arrow" || tool === "line") {
      this.shapeTool.setShapeType(tool as ShapeType);
    }
    if (tool === "select") {
      this.lassoTool.enter();
    }

    this.layers.interactionLayer.style.cursor = this.cursorForTool();
    this.emitter.emit("toolChanged", tool);
  }

  setColor(color: string): void {
    this.color = color;
    this.strokeTool.setColor(color);
    this.shapeTool.setColor(color);
    this.textTool.setColor(color);
    this.emitter.emit("colorChanged", color);
  }

  setSize(size: number): void {
    this.brushSize = size;
    this.strokeTool.setSize(size);
    this.eraserTool.setSize(size);
    this.shapeTool.setStrokeWidth(size);
    this.emitter.emit("sizeChanged", size);
  }

  getRecentStrokesBounds(): Rect | null {
    return this.strokeTool.getRecentStrokesBounds();
  }

  getItems(): CanvasItem[] {
    return this.items;
  }

  getItem(id: string): CanvasItem | undefined {
    return this.items.find((it) => it.id === id);
  }

  addItem(item: CanvasItem): void {
    const itemsBefore = [...this.items];
    this.items = [...this.items, item];
    this.undoStack.pushItemsChange(itemsBefore, this.items);
    this.requestRender();
    this.onCommit();
    this.emitter.emit("canUndoChanged", this.undoStack.canUndo);
    this.emitter.emit("canRedoChanged", this.undoStack.canRedo);
    this.emitter.emit("itemsChanged", this.items);
  }

  deleteItem(id: string): void {
    const itemsBefore = [...this.items];
    this.items = this.items.filter((item) => item.id !== id);
    if (this.items.length !== itemsBefore.length) {
      this.undoStack.pushItemsChange(itemsBefore, this.items);
      this.requestRender();
      this.onCommit();
      this.emitter.emit("canUndoChanged", this.undoStack.canUndo);
      this.emitter.emit("canRedoChanged", this.undoStack.canRedo);
      this.emitter.emit("itemsChanged", this.items);
    }
  }

  updateItem(id: string, updates: Partial<CanvasItem>): void {
    const itemsBefore = [...this.items];
    let updated = false;
    this.items = this.items.map((item) => {
      if (item.id === id) {
        updated = true;
        return { ...item, ...updates } as CanvasItem;
      }
      return item;
    });
    if (updated) {
      this.undoStack.pushItemsChange(itemsBefore, this.items);
      this.requestRender();
      this.onCommit();
      this.emitter.emit("canUndoChanged", this.undoStack.canUndo);
      this.emitter.emit("canRedoChanged", this.undoStack.canRedo);
      this.emitter.emit("itemsChanged", this.items);
    }
  }

  processWheelAtPoint(screenX: number, screenY: number, deltaY: number): void {
    const factor = deltaY < 0 ? 1.1 : 0.9;
    this.camera.zoomAtPoint(screenX, screenY, factor);
    this.requestRender();
    this.emitter.emit("zoomChanged", this.camera.scale);
  }

  undo(): void {
    const record = this.undoStack.undo();
    if (!record) return;

    for (const snap of record.tilesBefore) {
      this.tiles.restore(snap);
    }
    this.items = record.itemsBefore;

    this.requestRender();
    this.onCommit();
    this.emitter.emit("canUndoChanged", this.undoStack.canUndo);
    this.emitter.emit("canRedoChanged", this.undoStack.canRedo);
    this.emitter.emit("itemsChanged", this.items);
  }

  redo(): void {
    const record = this.undoStack.redo();
    if (!record) return;

    for (const snap of record.tilesAfter) {
      this.tiles.restore(snap);
    }
    this.items = record.itemsAfter;

    this.requestRender();
    this.onCommit();
    this.emitter.emit("canUndoChanged", this.undoStack.canUndo);
    this.emitter.emit("canRedoChanged", this.undoStack.canRedo);
    this.emitter.emit("itemsChanged", this.items);
  }

  async clearAll(): Promise<void> {
    const tilesBefore = this.tiles.snapshotRect({
      x: -WORLD_SIZE, y: -WORLD_SIZE, w: WORLD_SIZE * 2, h: WORLD_SIZE * 2
    });
    const itemsBefore = [...this.items];

    this.tiles.clearAll();
    this.items = [];

    const byteSize = tilesBefore.reduce((a, t) => a + t.data.data.byteLength, 0);
    this.undoStack.push({
      tilesBefore,
      tilesAfter: [],
      itemsBefore,
      itemsAfter: [],
      byteSize,
    });

    // Wipe IndexedDB storage synchronously so page refresh never restores cleared data
    await this.persistence.clearDoc();

    this.requestRender();
    this.emitter.emit("canUndoChanged", this.undoStack.canUndo);
    this.emitter.emit("canRedoChanged", this.undoStack.canRedo);
    this.emitter.emit("itemsChanged", this.items);
  }

  fitContent(): void {
    const bounds = this.tiles.globalInkBounds();
    if (!bounds) return;
    this.camera.fitBounds(bounds, this.layers.cssWidth, this.layers.cssHeight);
    this.requestRender();
    this.emitter.emit("zoomChanged", this.camera.scale);
  }

  zoomIn(): void {
    const cx = this.layers.cssWidth / 2;
    const cy = this.layers.cssHeight / 2;
    this.camera.zoomAtPoint(cx, cy, 1.25);
    this.requestRender();
    this.emitter.emit("zoomChanged", this.camera.scale);
  }

  zoomOut(): void {
    const cx = this.layers.cssWidth / 2;
    const cy = this.layers.cssHeight / 2;
    this.camera.zoomAtPoint(cx, cy, 0.8);
    this.requestRender();
    this.emitter.emit("zoomChanged", this.camera.scale);
  }

  setZoom(scale: number): void {
    const cx = this.layers.cssWidth / 2;
    const cy = this.layers.cssHeight / 2;
    const factor = scale / this.camera.scale;
    this.camera.zoomAtPoint(cx, cy, factor);
    this.requestRender();
    this.emitter.emit("zoomChanged", this.camera.scale);
  }

  resetZoom(): void {
    this.camera.reset();
    this.requestRender();
    this.emitter.emit("zoomChanged", this.camera.scale);
  }

  toggleGrid(): boolean {
    this.showGrid = !this.showGrid;
    this.requestRender();
    return this.showGrid;
  }

  async exportPng(): Promise<void> {
    await exportPng(this.tiles, this.items);
  }

  async copyToClipboard(): Promise<boolean> {
    return copyToClipboard(this.tiles, this.items);
  }

  async saveNow(): Promise<void> {
    await this.persistence.save({
      docId: "default",
      tiles: new Map(
        this.tiles.keys().map((k) => {
          const [tx, ty] = k.split(",").map(Number);
          const tile = this.tiles.get(tx, ty, false);
          return [k, tile!.canvas] as [string, HTMLCanvasElement];
        })
      ),
      items: this.items,
      camera: this.camera.toState(),
    });
    this.emitter.emit("saved", undefined as void);
  }

  on<K extends keyof EngineEventMap>(
    event: K,
    fn: (data: EngineEventMap[K]) => void
  ): () => void {
    return this.emitter.on(event, fn);
  }

  get currentTool(): ToolName {
    return this.activeTool;
  }

  get currentColor(): string {
    return this.color;
  }

  get currentSize(): number {
    return this.brushSize;
  }

  get zoomLevel(): number {
    return this.camera.scale;
  }

  get canUndo(): boolean {
    return this.undoStack.canUndo;
  }

  get canRedo(): boolean {
    return this.undoStack.canRedo;
  }

  get minScale(): number {
    return CAMERA_MIN_SCALE;
  }

  get maxScale(): number {
    return CAMERA_MAX_SCALE;
  }

  // ── Helpers ─────────────────────────────────────────────

  private cursorForTool(): string {
    switch (this.activeTool) {
      case "pen":
      case "highlighter": return "crosshair";
      case "eraser": return "cell";
      case "hand": return "grab";
      case "select": return "default";
      case "text": return "text";
      default: return "crosshair";
    }
  }

  private preloadImage(src: string): void {
    if (this.imgCache.has(src)) return;
    const img = new Image();
    img.src = src;
    this.imgCache.set(src, img);
  }

  // ── Destroy ──────────────────────────────────────────────

  destroy(): void {
    this.destroyed = true;
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);

    const el = this.layers.interactionLayer;
    el.removeEventListener("pointerdown", this.handlePointerDown);
    el.removeEventListener("pointermove", this.handlePointerMove);
    el.removeEventListener("pointerup", this.handlePointerUp);
    el.removeEventListener("pointercancel", this.handlePointerCancel);
    el.removeEventListener("wheel", this.handleWheel);

    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("beforeunload", this.handleBeforeUnload);

    this.textTool.destroy();
    this.lassoTool.exit();
    this.persistence.destroy();
    this.layers.destroy();
    this.imgCache.clear();
  }
}
