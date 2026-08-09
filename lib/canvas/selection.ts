// ============================================================
// Drawva Canvas Engine — Rectangular Marquee Select Tool
// Drag a rectangular marquee to select both tile ink and items
// (images, shapes, text, widgets). Move, delete, undo.
// ============================================================

import type { Camera } from "./camera";
import type { TileMap } from "./tiles";
import type { Layers } from "./layers";
import type { UndoStack } from "./undo";
import type { CanvasItem, Point, Rect, TextItem } from "./types";
import { TILE } from "./tiles";

type SelectionState = "idle" | "drawing_marquee" | "selected" | "moving";

interface SelectedPixels {
  worldRect: Rect;
  imageData: ImageData;
  offsetX: number;
  offsetY: number;
}

interface ItemInitialPos {
  id: string;
  x: number;
  y: number;
}

export class LassoSelectTool {
  private state: SelectionState = "idle";
  private activePointerId: number | null = null;
  private startPoint: Point = { x: 0, y: 0 };
  private currentPoint: Point = { x: 0, y: 0 };
  private selectedItems: CanvasItem[] = [];
  private initialItemPositions: ItemInitialPos[] = [];
  private selectedPixels: SelectedPixels | null = null;
  private dragStart: Point | null = null;
  private marchingOffset = 0;
  private marchingTimer: ReturnType<typeof setInterval> | null = null;

  private camera: Camera;
  private tiles: TileMap;
  private layers: Layers;
  private undoStack: UndoStack;
  private requestRender: () => void;
  private getItems: () => CanvasItem[];
  private setItems: (items: CanvasItem[]) => void;
  private onCommit: () => void;

  constructor(
    camera: Camera,
    tiles: TileMap,
    layers: Layers,
    undoStack: UndoStack,
    requestRender: () => void,
    getItems: () => CanvasItem[],
    setItems: (items: CanvasItem[]) => void,
    onCommit: () => void
  ) {
    this.camera = camera;
    this.tiles = tiles;
    this.layers = layers;
    this.undoStack = undoStack;
    this.requestRender = requestRender;
    this.getItems = getItems;
    this.setItems = setItems;
    this.onCommit = onCommit;
  }

  enter(): void {
    this.state = "idle";
  }

  exit(): void {
    this.cancel();
  }

  // ── Pointer events ─────────────────────────────────────

  onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const world = this.camera.screenToWorld({ x: e.offsetX, y: e.offsetY });

    if (this.state === "selected") {
      // Check if clicking inside existing selection marquee to move it
      if (this.hitTestSelection(world)) {
        this.state = "moving";
        this.dragStart = world;
        this.activePointerId = e.pointerId;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch { /* ignore */ }
        return;
      }
      // Click outside selection → commit current move and start new selection
      this.commitMove();
      this.cancel();
    }

    // Start rectangular marquee selection
    this.state = "drawing_marquee";
    this.activePointerId = e.pointerId;
    this.startPoint = world;
    this.currentPoint = world;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch { /* ignore */ }
  }

  onPointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;
    const world = this.camera.screenToWorld({ x: e.offsetX, y: e.offsetY });

    if (this.state === "drawing_marquee") {
      this.currentPoint = world;
      this.drawMarqueeOverlay();
    } else if (this.state === "moving" && this.dragStart) {
      const dx = world.x - this.dragStart.x;
      const dy = world.y - this.dragStart.y;

      if (this.selectedPixels) {
        this.selectedPixels.offsetX += dx;
        this.selectedPixels.offsetY += dy;
      }

      // Update positions of selected items (images, shapes, text, widgets)
      if (this.selectedItems.length > 0 && this.selectedPixels) {
        const totalDx = this.selectedPixels.offsetX;
        const totalDy = this.selectedPixels.offsetY;
        for (const item of this.selectedItems) {
          const init = this.initialItemPositions.find((p) => p.id === item.id);
          if (init && "x" in item && "y" in item) {
            (item as { x: number; y: number }).x = init.x + totalDx;
            (item as { x: number; y: number }).y = init.y + totalDy;
          }
        }
      }

      this.dragStart = world;
      this.drawMarqueeOverlay();
      this.requestRender();
    }
  }

  onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }

    if (this.state === "drawing_marquee") {
      this.finishMarquee();
    } else if (this.state === "moving") {
      this.state = "selected";
      this.activePointerId = null;
    }
  }

  onPointerCancel(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;
    if (this.state === "moving") {
      this.state = "selected";
    } else {
      this.cancel();
    }
    this.activePointerId = null;
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      this.cancel();
    } else if ((e.key === "Delete" || e.key === "Backspace") && this.state === "selected") {
      this.deleteSelection();
    }
  }

  cancel(): void {
    this.commitMove();
    this.state = "idle";
    this.activePointerId = null;
    this.selectedItems = [];
    this.initialItemPositions = [];
    this.selectedPixels = null;
    this.dragStart = null;
    this.stopMarching();
    this.clearInteractionLayer();
  }

  // ── Finish marquee selection ───────────────────────────

  private finishMarquee(): void {
    const x = Math.min(this.startPoint.x, this.currentPoint.x);
    const y = Math.min(this.startPoint.y, this.currentPoint.y);
    const w = Math.abs(this.currentPoint.x - this.startPoint.x);
    const h = Math.abs(this.currentPoint.y - this.startPoint.y);

    const worldRect: Rect = { x, y, w, h };

    if (worldRect.w < 4 || worldRect.h < 4) {
      this.cancel();
      return;
    }

    const itemsBefore = [...this.getItems()];
    const tilesBefore = this.tiles.snapshotRect(worldRect);

    // Extract tile pixel region inside worldRect
    const pixelW = Math.ceil(worldRect.w);
    const pixelH = Math.ceil(worldRect.h);
    const offscreen = document.createElement("canvas");
    offscreen.width = pixelW;
    offscreen.height = pixelH;
    const offCtx = offscreen.getContext("2d")!;

    this.tiles.forTilesInRect(worldRect, (tile, tx, ty) => {
      offCtx.drawImage(
        tile.canvas,
        0, 0, tile.canvas.width, tile.canvas.height,
        tx * TILE - worldRect.x,
        ty * TILE - worldRect.y,
        TILE, TILE
      );
    });

    const imageData = offCtx.getImageData(0, 0, pixelW, pixelH);

    // Clear extracted pixels from tiles
    this.tiles.forTilesInRect(worldRect, (tile, tx, ty) => {
      tile.ctx.save();
      tile.ctx.globalCompositeOperation = "destination-out";
      tile.ctx.clearRect(
        worldRect.x - tx * TILE,
        worldRect.y - ty * TILE,
        worldRect.w,
        worldRect.h
      );
      tile.ctx.restore();
      tile.dirty = true;
    });

    // Store pixel selection
    this.selectedPixels = {
      worldRect,
      imageData,
      offsetX: 0,
      offsetY: 0,
    };

    // Find all items overlapping worldRect (Images, Shapes, Text, Widgets)
    this.selectedItems = itemsBefore.filter((item) => {
      if (!("x" in item) || !("y" in item)) return false;
      const ix = item.x as number;
      const iy = item.y as number;
      const iw = ("w" in item ? item.w : item.kind === "text" ? (item as TextItem).width : 40) as number;
      const ih = ("h" in item ? item.h : item.kind === "text" ? (item as TextItem).height : 20) as number;
      return rectsOverlap({ x: ix, y: iy, w: iw, h: ih }, worldRect);
    });

    // Store initial positions of selected items
    this.initialItemPositions = this.selectedItems.map((item) => ({
      id: item.id,
      x: (item as { x: number }).x,
      y: (item as { y: number }).y,
    }));

    const tilesAfter = this.tiles.snapshotRect(worldRect);
    const byteSize = tilesBefore.reduce((a, t) => a + t.data.data.byteLength, 0);
    this.undoStack.push({
      tilesBefore,
      tilesAfter,
      itemsBefore,
      itemsAfter: this.getItems(),
      byteSize,
    });

    this.state = "selected";
    this.activePointerId = null;
    this.startMarching();
    this.drawMarqueeOverlay();
    this.requestRender();
  }

  // ── Move commit / delete ───────────────────────────────

  private commitMove(): void {
    if (!this.selectedPixels) return;

    const { worldRect, imageData, offsetX, offsetY } = this.selectedPixels;
    const destRect: Rect = {
      x: worldRect.x + offsetX,
      y: worldRect.y + offsetY,
      w: worldRect.w,
      h: worldRect.h,
    };

    const tilesBefore = this.tiles.snapshotRect(destRect);

    // Blit floating image data back into tile map at new coordinates
    const offscreen = document.createElement("canvas");
    offscreen.width = Math.ceil(worldRect.w);
    offscreen.height = Math.ceil(worldRect.h);
    offscreen.getContext("2d")!.putImageData(imageData, 0, 0);

    this.tiles.forTilesInRect(
      destRect,
      (tile, tx, ty) => {
        tile.ctx.save();
        tile.ctx.drawImage(
          offscreen,
          0, 0, worldRect.w, worldRect.h,
          destRect.x - tx * TILE,
          destRect.y - ty * TILE,
          worldRect.w, worldRect.h
        );
        tile.ctx.restore();
        tile.dirty = true;
      },
      true /* create tiles as needed */
    );

    const tilesAfter = this.tiles.snapshotRect(destRect);
    const byteSize = tilesBefore.reduce((a, t) => a + t.data.data.byteLength, 0);
    this.undoStack.push({
      tilesBefore,
      tilesAfter,
      itemsBefore: this.getItems(),
      itemsAfter: this.getItems(),
      byteSize,
    });

    this.selectedPixels = null;
    this.selectedItems = [];
    this.initialItemPositions = [];
    this.requestRender();
    this.onCommit();
  }

  private deleteSelection(): void {
    if (this.selectedItems.length > 0) {
      const remaining = this.getItems().filter(
        (i) => !this.selectedItems.find((si) => si.id === i.id)
      );
      this.setItems(remaining);
    }
    this.selectedPixels = null;
    this.selectedItems = [];
    this.initialItemPositions = [];
    this.state = "idle";
    this.stopMarching();
    this.clearInteractionLayer();
    this.requestRender();
    this.onCommit();
  }

  // ── Hit test selection marquee ──────────────────────────

  private hitTestSelection(world: Point): boolean {
    if (!this.selectedPixels) return false;
    const { worldRect, offsetX, offsetY } = this.selectedPixels;
    const dest = {
      x: worldRect.x + offsetX,
      y: worldRect.y + offsetY,
      w: worldRect.w,
      h: worldRect.h,
    };
    return (
      world.x >= dest.x &&
      world.x <= dest.x + dest.w &&
      world.y >= dest.y &&
      world.y <= dest.y + dest.h
    );
  }

  // ── Drawing overlay on interaction layer ───────────────

  private drawMarqueeOverlay(): void {
    const ctx = this.layers.interactionCtx;
    const { dpr, cssWidth: w, cssHeight: h } = this.layers;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (this.state === "drawing_marquee") {
      const x = Math.min(this.startPoint.x, this.currentPoint.x);
      const y = Math.min(this.startPoint.y, this.currentPoint.y);
      const width = Math.abs(this.currentPoint.x - this.startPoint.x);
      const height = Math.abs(this.currentPoint.y - this.startPoint.y);

      const sTL = this.camera.worldToScreen({ x, y });
      const sBR = this.camera.worldToScreen({ x: x + width, y: y + height });

      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(59,130,246,0.9)";
      ctx.lineWidth = 1.5;
      ctx.fillStyle = "rgba(59,130,246,0.08)";

      const rectW = sBR.x - sTL.x;
      const rectH = sBR.y - sTL.y;
      ctx.fillRect(sTL.x, sTL.y, rectW, rectH);
      ctx.strokeRect(sTL.x, sTL.y, rectW, rectH);
    } else if (
      (this.state === "selected" || this.state === "moving") &&
      this.selectedPixels
    ) {
      const { worldRect, offsetX, offsetY, imageData } = this.selectedPixels;
      const dest = {
        x: worldRect.x + offsetX,
        y: worldRect.y + offsetY,
        w: worldRect.w,
        h: worldRect.h,
      };

      const sTL = this.camera.worldToScreen({ x: dest.x, y: dest.y });
      const sBR = this.camera.worldToScreen({ x: dest.x + dest.w, y: dest.y + dest.h });
      const sw = sBR.x - sTL.x;
      const sh = sBR.y - sTL.y;

      // Draw floating pixels
      const offscreen = document.createElement("canvas");
      offscreen.width = imageData.width;
      offscreen.height = imageData.height;
      offscreen.getContext("2d")!.putImageData(imageData, 0, 0);

      ctx.drawImage(offscreen, sTL.x, sTL.y, sw, sh);

      // Marching-ants border
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -this.marchingOffset;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sTL.x, sTL.y, sw, sh);

      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineDashOffset = -(this.marchingOffset + 6);
      ctx.strokeRect(sTL.x, sTL.y, sw, sh);
      ctx.restore();
    }

    ctx.restore();
  }

  private clearInteractionLayer(): void {
    const ctx = this.layers.interactionCtx;
    const { dpr, cssWidth: w, cssHeight: h } = this.layers;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
  }

  // ── Marching ants animation ────────────────────────────

  private startMarching(): void {
    if (this.marchingTimer) return;
    this.marchingTimer = setInterval(() => {
      this.marchingOffset = (this.marchingOffset + 0.5) % 12;
      this.drawMarqueeOverlay();
    }, 50);
  }

  private stopMarching(): void {
    if (this.marchingTimer) {
      clearInterval(this.marchingTimer);
      this.marchingTimer = null;
    }
  }
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}
