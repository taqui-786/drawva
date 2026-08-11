import { Camera } from "./camera";
import { TileManager } from "./tiles";
import { LayerManager } from "./layers";
import {
  CanvasItem,
  ToolType,
  StrokeItem,
  ShapeItem,
  TextBoxItem,
  ImageItem,
  StrokePoint,
  Point,
  BoundingBox,
} from "./types";
import { createStrokeItem, isStrokeIntersectingEraser } from "./strokes";
import { createShapeItem } from "./shapes";
import { createTextBoxItem } from "./textTool";
import { findItemAtPoint, moveItem, computeSelectionBounds, findItemsInLasso } from "./selection";
import { validateCommand, commandToCanvasItem } from "./commands";
import { drawFormulaOnCanvas } from "./formulas";
import { drawFunctionPlot } from "./plotter";

export interface CanvasEngineOptions {
  container: HTMLElement;
  initialTool?: ToolType;
  onToolChange?: (tool: ToolType) => void;
  onStateChange?: (engine: CanvasEngine) => void;
}

export class CanvasEngine {
  public camera: Camera;
  public tileManager: TileManager;
  public layerManager: LayerManager;

  public activeTool: ToolType = "pen";
  public activeColor: string = "#1e293b";
  public activeSize: number = 4;
  public isDarkTheme: boolean = false;

  public items: CanvasItem[] = [];
  public draftItems: CanvasItem[] = [];
  public selectedItemIds: string[] = [];
  public selectionBounds: BoundingBox | null = null;

  private container: HTMLElement;
  private isDirty: boolean = true;
  private animFrameId: number | null = null;
  private isDestroyed: boolean = false;

  public isPanning: boolean = false;
  private isDrawing: boolean = false;
  private isDraggingItem: boolean = false;
  private lastMousePos: { x: number; y: number } | null = null;
  private currentStrokePoints: StrokePoint[] = [];
  private currentLassoPoints: Point[] = [];
  private dragStartWorld: Point | null = null;

  private onStateChangeCallback?: (engine: CanvasEngine) => void;
  private onToolChangeCallback?: (tool: ToolType) => void;

  private nextIdCounter: number = 1;

  constructor(options: CanvasEngineOptions) {
    this.container = options.container;
    this.camera = new Camera();
    this.tileManager = new TileManager();
    this.layerManager = new LayerManager();

    if (options.initialTool) this.activeTool = options.initialTool;
    this.onStateChangeCallback = options.onStateChange;
    this.onToolChangeCallback = options.onToolChange;

    this.init();
  }

  private init(): void {
    this.layerManager.mount(this.container);
    this.camera.setViewportSize(this.layerManager.width, this.layerManager.height);

    this.attachEventListeners();
    this.updateCursor();
    this.requestRender();
    this.startLoop();
  }

  public setTool(tool: ToolType): void {
    if (this.activeTool !== tool) {
      this.activeTool = tool;
      if (this.onToolChangeCallback) this.onToolChangeCallback(tool);
      this.updateCursor();
      this.requestRender();
      this.notifyStateChange();
    }
  }

  public setColor(color: string): void {
    this.activeColor = color;
    this.requestRender();
  }

  public setSize(size: number): void {
    this.activeSize = size;
    this.requestRender();
  }

  public requestRender(): void {
    this.isDirty = true;
  }

  public notifyStateChange(): void {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(this);
    }
  }

  public updateCursor(): void {
    const canvas = this.layerManager.layers?.interactionCanvas;
    if (!canvas) return;

    if (this.isPanning) {
      canvas.style.cursor = "grabbing";
      return;
    }
    if (this.isDraggingItem) {
      canvas.style.cursor = "move";
      return;
    }

    switch (this.activeTool) {
      case "hand":
        canvas.style.cursor = "grab";
        break;
      case "select":
        canvas.style.cursor = "default";
        break;
      case "lasso":
      case "pen":
      case "highlighter":
      case "rect":
      case "ellipse":
      case "arrow":
      case "line":
        canvas.style.cursor = "crosshair";
        break;
      case "eraser":
        canvas.style.cursor = "cell";
        break;
      case "text":
        canvas.style.cursor = "text";
        break;
      default:
        canvas.style.cursor = "default";
    }
  }

  private startLoop(): void {
    const loop = () => {
      if (this.isDestroyed) return;
      if (this.isDirty) {
        this.render();
        this.isDirty = false;
      }
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  public generateId(prefix: string = "item"): string {
    return `${prefix}-${Date.now()}-${this.nextIdCounter++}`;
  }

  public setDraftCommands(rawCommands: Record<string, unknown>[]): void {
    const validItems: CanvasItem[] = [];
    for (const rawCmd of rawCommands) {
      const res = validateCommand(rawCmd);
      if (res.valid && res.command) {
        const item = commandToCanvasItem(res.command, (p) => this.generateId(p));
        if (item) validItems.push(item);
      } else if (res.reason) {
        console.warn(`[Canvas Engine] Command rejected: ${res.reason}`);
      }
    }
    this.draftItems = validItems;
    this.requestRender();
    this.notifyStateChange();
  }

  public acceptDraft(): void {
    if (this.draftItems.length > 0) {
      this.items.push(...this.draftItems);
      this.draftItems = [];
      this.requestRender();
      this.notifyStateChange();
    }
  }

  public discardDraft(): void {
    if (this.draftItems.length > 0) {
      this.draftItems = [];
      this.requestRender();
      this.notifyStateChange();
    }
  }

  public render(): void {
    if (!this.layerManager.contexts || !this.layerManager.layers) return;
    const { gridCtx, tileCtx, objectCtx, interactionCtx } = this.layerManager.contexts;
    const dpr = this.layerManager.dpr;
    const width = this.layerManager.width;
    const height = this.layerManager.height;

    gridCtx.save();
    tileCtx.save();
    objectCtx.save();
    interactionCtx.save();

    gridCtx.clearRect(0, 0, width * dpr, height * dpr);
    tileCtx.clearRect(0, 0, width * dpr, height * dpr);
    objectCtx.clearRect(0, 0, width * dpr, height * dpr);
    interactionCtx.clearRect(0, 0, width * dpr, height * dpr);

    gridCtx.scale(dpr, dpr);
    tileCtx.scale(dpr, dpr);
    objectCtx.scale(dpr, dpr);
    interactionCtx.scale(dpr, dpr);

    this.renderGrid(gridCtx, width, height);

    const bounds = this.camera.getViewportWorldBounds();

    [tileCtx, objectCtx, interactionCtx].forEach((ctx) => {
      ctx.translate(width / 2, height / 2);
      ctx.scale(this.camera.zoom, this.camera.zoom);
      ctx.translate(-this.camera.x, -this.camera.y);
    });

    const visibleTiles = this.tileManager.getVisibleTileKeys(bounds);
    for (const key of visibleTiles) {
      const { tx, ty } = TileManager.parseKey(key);
      this.tileManager.drawTileToContext(tileCtx, tx, ty);
    }

    for (const item of this.items) {
      this.renderItem(tileCtx, objectCtx, item);
    }

    for (const draft of this.draftItems) {
      interactionCtx.save();
      interactionCtx.globalAlpha = 0.6;
      this.renderItem(interactionCtx, interactionCtx, draft);
      interactionCtx.restore();
    }

    // Render active pen/highlighter stroke in real-time while dragging mouse
    if (
      this.isDrawing &&
      this.currentStrokePoints.length > 0 &&
      (this.activeTool === "pen" || this.activeTool === "highlighter")
    ) {
      const activeStroke: StrokeItem = {
        id: "active-stroke",
        kind: "stroke",
        tool: this.activeTool,
        points: this.currentStrokePoints,
        color: this.activeColor,
        size: this.activeSize,
        opacity: this.activeTool === "highlighter" ? 0.4 : 1.0,
        box: { x: 0, y: 0, w: 0, h: 0 },
      };
      this.drawStroke(interactionCtx, activeStroke);
    }

    // Render active lasso selection polygon overlay
    if (this.isDrawing && this.currentLassoPoints.length > 1 && this.activeTool === "lasso") {
      interactionCtx.save();
      interactionCtx.strokeStyle = "#3b82f6";
      interactionCtx.lineWidth = 2 / this.camera.zoom;
      interactionCtx.setLineDash([4 / this.camera.zoom, 4 / this.camera.zoom]);
      interactionCtx.fillStyle = "rgba(59, 130, 246, 0.15)";
      interactionCtx.beginPath();
      interactionCtx.moveTo(this.currentLassoPoints[0].x, this.currentLassoPoints[0].y);
      for (let i = 1; i < this.currentLassoPoints.length; i++) {
        interactionCtx.lineTo(this.currentLassoPoints[i].x, this.currentLassoPoints[i].y);
      }
      interactionCtx.closePath();
      interactionCtx.fill();
      interactionCtx.stroke();
      interactionCtx.restore();
    }

    if (this.selectedItemIds.length > 0) {
      this.selectionBounds = computeSelectionBounds(this.items, this.selectedItemIds);
      if (this.selectionBounds) {
        this.drawSelectionOverlay(interactionCtx, this.selectionBounds);
      }
    }

    gridCtx.restore();
    tileCtx.restore();
    objectCtx.restore();
    interactionCtx.restore();
  }

  private renderItem(tileCtx: CanvasRenderingContext2D, objectCtx: CanvasRenderingContext2D, item: CanvasItem): void {
    if (item.kind === "stroke") {
      this.drawStroke(tileCtx, item);
    } else if (item.kind === "shape") {
      this.drawShape(objectCtx, item);
    } else if (item.kind === "text") {
      this.drawTextBox(objectCtx, item);
    } else if (item.kind === "image") {
      this.drawImageItem(objectCtx, item);
    } else if (item.kind === "formula") {
      drawFormulaOnCanvas(objectCtx, item);
    } else if (item.kind === "plot") {
      drawFunctionPlot(objectCtx, item);
    }
  }

  private renderGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const gridSpacing = 40 * this.camera.zoom;
    if (gridSpacing < 8) return;

    const startX = ((-this.camera.x * this.camera.zoom + width / 2) % gridSpacing + gridSpacing) % gridSpacing;
    const startY = ((-this.camera.y * this.camera.zoom + height / 2) % gridSpacing + gridSpacing) % gridSpacing;

    ctx.strokeStyle = this.isDarkTheme ? "#1e293b" : "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = startX; x < width; x += gridSpacing) {
      ctx.moveTo(Math.floor(x) + 0.5, 0);
      ctx.lineTo(Math.floor(x) + 0.5, height);
    }
    for (let y = startY; y < height; y += gridSpacing) {
      ctx.moveTo(0, Math.floor(y) + 0.5);
      ctx.lineTo(width, Math.floor(y) + 0.5);
    }
    ctx.stroke();
  }

  public drawStroke(ctx: CanvasRenderingContext2D, item: StrokeItem): void {
    if (!item.points || item.points.length === 0) return;
    ctx.save();
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = item.opacity ?? 1.0;

    ctx.beginPath();
    ctx.moveTo(item.points[0].x, item.points[0].y);
    for (let i = 1; i < item.points.length; i++) {
      const pt = item.points[i];
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  public drawShape(ctx: CanvasRenderingContext2D, item: ShapeItem): void {
    ctx.save();
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (item.fillColor) {
      ctx.fillStyle = item.fillColor;
    }

    ctx.beginPath();
    if (item.shapeType === "rect") {
      ctx.rect(item.x, item.y, item.w, item.h);
      if (item.fillColor) ctx.fill();
      ctx.stroke();
    } else if (item.shapeType === "ellipse") {
      const rx = Math.abs(item.w / 2);
      const ry = Math.abs(item.h / 2);
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (item.fillColor) ctx.fill();
      ctx.stroke();
    } else if (item.shapeType === "line") {
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(item.x + item.w, item.y + item.h);
      ctx.stroke();
    } else if (item.shapeType === "arrow") {
      const startX = item.x;
      const startY = item.y;
      const endX = item.x + item.w;
      const endY = item.y + item.h;
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      const angle = Math.atan2(endY - startY, endX - startX);
      const headLen = Math.max(12, item.strokeWidth * 3);
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = item.color;
      ctx.fill();
    }
    ctx.restore();
  }

  public drawTextBox(ctx: CanvasRenderingContext2D, item: TextBoxItem): void {
    if (item.image) {
      ctx.drawImage(item.image, item.x, item.y, item.w, item.h);
      return;
    }
    ctx.save();
    ctx.fillStyle = item.color;
    ctx.font = `${item.fontSize}px ui-rounded, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(item.text, item.x, item.y);
    ctx.restore();
  }

  public drawImageItem(ctx: CanvasRenderingContext2D, item: ImageItem): void {
    if (item.image) {
      ctx.drawImage(item.image, item.x, item.y, item.w, item.h);
    }
  }

  private drawSelectionOverlay(ctx: CanvasRenderingContext2D, box: BoundingBox): void {
    ctx.save();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2 / this.camera.zoom;
    ctx.setLineDash([6 / this.camera.zoom, 6 / this.camera.zoom]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.restore();
  }

  private attachEventListeners(): void {
    const interactionLayer = this.layerManager.layers?.interactionCanvas;
    if (!interactionLayer) return;

    window.addEventListener("resize", this.handleResize);

    interactionLayer.addEventListener("wheel", this.handleWheel, { passive: false });
    interactionLayer.addEventListener("pointerdown", this.handlePointerDown);
    interactionLayer.addEventListener("pointermove", this.handlePointerMove);
    interactionLayer.addEventListener("pointerup", this.handlePointerUp);
  }

  private handleResize = (): void => {
    if (!this.container) return;
    this.layerManager.resize(this.container.clientWidth, this.container.clientHeight);
    this.camera.setViewportSize(this.layerManager.width, this.layerManager.height);
    this.requestRender();
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (e.ctrlKey || e.metaKey) {
      // Touchpad pinch or Ctrl+wheel
      const delta = e.deltaY * (e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? 500 : 1);
      const zoomFactor = Math.exp(-delta * 0.003);
      this.camera.zoomAt(screenPoint, zoomFactor);
    } else if (e.shiftKey) {
      // Shift + wheel pans horizontally
      this.camera.panBy(e.deltaY, 0);
    } else {
      // Standard Mouse Wheel / Trackpad Pan vs Zoom
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        this.camera.panBy(e.deltaX, e.deltaY);
      } else {
        const delta = e.deltaY * (e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? 500 : 1);
        const zoomFactor = Math.exp(-delta * 0.002);
        this.camera.zoomAt(screenPoint, zoomFactor);
      }
    }
    this.requestRender();
    this.notifyStateChange();
  };

  private handlePointerDown = (e: PointerEvent): void => {
    try {
      (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    } catch {}

    const isMiddleClick = e.button === 1;
    const isSpaceOrHand = this.activeTool === "hand" || isMiddleClick;

    if (isSpaceOrHand) {
      this.isPanning = true;
      this.lastMousePos = { x: e.clientX, y: e.clientY };
      this.updateCursor();
      return;
    }

    const rect = this.container.getBoundingClientRect();
    const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const worldPoint = this.camera.screenToWorld(screenPoint);

    if (this.activeTool === "select") {
      const clickedItem = findItemAtPoint(this.items, worldPoint);
      if (clickedItem) {
        this.selectedItemIds = [clickedItem.id];
        this.isDraggingItem = true;
        this.dragStartWorld = worldPoint;
      } else {
        this.selectedItemIds = [];
      }
      this.updateCursor();
      this.requestRender();
      return;
    }

    if (this.activeTool === "lasso") {
      this.isDrawing = true;
      this.currentLassoPoints = [worldPoint];
      this.requestRender();
      return;
    }

    if (this.activeTool === "pen" || this.activeTool === "highlighter") {
      this.isDrawing = true;
      this.currentStrokePoints = [{ x: worldPoint.x, y: worldPoint.y, pressure: e.pressure || 0.5 }];
      this.requestRender();
      return;
    }

    if (this.activeTool === "eraser") {
      this.isDrawing = true;
      this.eraseAtPoint(worldPoint);
      return;
    }

    if (["rect", "ellipse", "arrow", "line"].includes(this.activeTool)) {
      this.isDrawing = true;
      this.dragStartWorld = worldPoint;
      const shapeType = this.activeTool as "rect" | "ellipse" | "arrow" | "line";
      const shape = createShapeItem(
        this.generateId("shape"),
        shapeType,
        worldPoint,
        worldPoint,
        this.activeColor,
        this.activeSize
      );
      this.items.push(shape);
      this.requestRender();
      return;
    }

    if (this.activeTool === "text") {
      const text = prompt("Enter text:", "Sample text");
      if (text) {
        const textBox = createTextBoxItem(
          this.generateId("text"),
          worldPoint.x,
          worldPoint.y,
          text,
          24,
          this.activeColor
        );
        this.items.push(textBox);
        this.requestRender();
        this.notifyStateChange();
      }
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.isPanning && this.lastMousePos) {
      const dx = e.clientX - this.lastMousePos.x;
      const dy = e.clientY - this.lastMousePos.y;
      this.lastMousePos = { x: e.clientX, y: e.clientY };

      // Correct hand drag panning direction (screen movement dx, dy directly)
      this.camera.panBy(dx, dy);
      this.requestRender();
      return;
    }

    const rect = this.container.getBoundingClientRect();
    const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const worldPoint = this.camera.screenToWorld(screenPoint);

    if (this.isDraggingItem && this.dragStartWorld && this.selectedItemIds.length > 0) {
      const dx = worldPoint.x - this.dragStartWorld.x;
      const dy = worldPoint.y - this.dragStartWorld.y;
      this.dragStartWorld = worldPoint;

      this.items = this.items.map((item) =>
        this.selectedItemIds.includes(item.id) ? moveItem(item, dx, dy) : item
      );
      this.requestRender();
      return;
    }

    if (!this.isDrawing) return;

    if (this.activeTool === "lasso") {
      this.currentLassoPoints.push(worldPoint);
      this.requestRender();
      return;
    }

    if (this.activeTool === "pen" || this.activeTool === "highlighter") {
      this.currentStrokePoints.push({ x: worldPoint.x, y: worldPoint.y, pressure: e.pressure || 0.5 });
      this.requestRender();
      return;
    }

    if (this.activeTool === "eraser") {
      this.eraseAtPoint(worldPoint);
      return;
    }

    if (["rect", "ellipse", "arrow", "line"].includes(this.activeTool) && this.dragStartWorld) {
      const lastItem = this.items[this.items.length - 1];
      if (lastItem && lastItem.kind === "shape") {
        const shapeType = this.activeTool as "rect" | "ellipse" | "arrow" | "line";
        const updatedShape = createShapeItem(
          lastItem.id,
          shapeType,
          this.dragStartWorld,
          worldPoint,
          this.activeColor,
          this.activeSize
        );
        this.items[this.items.length - 1] = updatedShape;
        this.requestRender();
      }
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    try {
      (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
    } catch {}

    if (this.isPanning) {
      this.isPanning = false;
      this.lastMousePos = null;
      this.updateCursor();
      this.notifyStateChange();
    }

    if (this.isDraggingItem) {
      this.isDraggingItem = false;
      this.dragStartWorld = null;
      this.updateCursor();
      this.notifyStateChange();
    }

    if (this.isDrawing) {
      this.isDrawing = false;
      if (this.activeTool === "lasso") {
        if (this.currentLassoPoints.length > 2) {
          this.selectedItemIds = findItemsInLasso(this.items, this.currentLassoPoints);
        }
        this.currentLassoPoints = [];
        this.updateCursor();
        this.requestRender();
        this.notifyStateChange();
      } else if (this.activeTool === "pen" || this.activeTool === "highlighter") {
        if (this.currentStrokePoints.length > 0) {
          const stroke = createStrokeItem(
            this.generateId("stroke"),
            this.activeTool,
            [...this.currentStrokePoints],
            this.activeColor,
            this.activeSize
          );
          this.items.push(stroke);
          this.currentStrokePoints = [];
          this.requestRender();
        }
        this.notifyStateChange();
      }
      this.dragStartWorld = null;
    }
  };

  private eraseAtPoint(point: Point): void {
    const eraserRadius = Math.max(12, this.activeSize * 3);
    const initialCount = this.items.length;

    this.items = this.items.filter((item) => {
      if (item.kind === "stroke") {
        return !isStrokeIntersectingEraser(item, point, eraserRadius);
      }
      return true;
    });

    if (this.items.length !== initialCount) {
      this.requestRender();
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    window.removeEventListener("resize", this.handleResize);
    this.layerManager.unmount();
  }
}
