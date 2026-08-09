// ============================================================
// Drawva Canvas Engine — Eraser Tool
// Raster eraser using destination-out compositing.
// Draws circles at each pointer point, updates inkBounds.
// ============================================================

import type { Camera } from "./camera";
import type { TileMap } from "./tiles";
import type { Layers } from "./layers";
import type { UndoStack } from "./undo";
import type { CanvasItem, Rect } from "./types";
import { TILE } from "./tiles";

export class EraserTool {
  private erasing = false;
  private activePointerId: number | null = null;
  private erasedRect: Rect | null = null;
  private tilesBefore: ReturnType<TileMap["snapshotRect"]> = [];

  private camera: Camera;
  private tiles: TileMap;
  private layers: Layers;
  private undoStack: UndoStack;
  private requestRender: () => void;
  private onCommit: () => void;
  private getItems: () => CanvasItem[];

  private eraserSize = 20; // world units diameter

  constructor(
    camera: Camera,
    tiles: TileMap,
    layers: Layers,
    undoStack: UndoStack,
    requestRender: () => void,
    onCommit: () => void,
    getItems: () => CanvasItem[]
  ) {
    this.camera = camera;
    this.tiles = tiles;
    this.layers = layers;
    this.undoStack = undoStack;
    this.requestRender = requestRender;
    this.onCommit = onCommit;
    this.getItems = getItems;
  }

  setSize(size: number): void {
    this.eraserSize = size * 4; // size slider → eraser diameter
  }

  onPointerDown(e: PointerEvent): void {
    if (this.erasing) return;
    if (e.button !== 0) return;

    this.erasing = true;
    this.activePointerId = e.pointerId;
    this.erasedRect = null;
    this.tilesBefore = [];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const world = this.camera.screenToWorld({ x: e.offsetX, y: e.offsetY });
    this.eraseAt(world.x, world.y);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.erasing || e.pointerId !== this.activePointerId) return;

    const coalesced = e.getCoalescedEvents?.() ?? [];
    const pts = coalesced.length > 0 ? coalesced : [e];

    for (const ce of pts) {
      const world = this.camera.screenToWorld({ x: ce.offsetX, y: ce.offsetY });
      this.eraseAt(world.x, world.y);
    }

    this.requestRender();
  }

  onPointerUp(e: PointerEvent): void {
    if (!this.erasing || e.pointerId !== this.activePointerId) return;
    this.finishErase();
  }

  onPointerCancel(e: PointerEvent): void {
    if (!this.erasing || e.pointerId !== this.activePointerId) return;
    this.finishErase();
  }

  private eraseAt(worldX: number, worldY: number): void {
    const r = this.eraserSize / 2;
    const circleRect: Rect = {
      x: worldX - r,
      y: worldY - r,
      w: this.eraserSize,
      h: this.eraserSize,
    };

    // Expand the total erased rect for undo snapshot
    if (!this.erasedRect) {
      this.erasedRect = { ...circleRect };
    } else {
      const ex = Math.min(this.erasedRect.x, circleRect.x);
      const ey = Math.min(this.erasedRect.y, circleRect.y);
      const ex2 = Math.max(this.erasedRect.x + this.erasedRect.w, circleRect.x + circleRect.w);
      const ey2 = Math.max(this.erasedRect.y + this.erasedRect.h, circleRect.y + circleRect.h);
      this.erasedRect = { x: ex, y: ey, w: ex2 - ex, h: ey2 - ey };
    }

    // Snapshot tiles that haven't been snapshotted yet
    this.tiles.forTilesInRect(circleRect, (_, tx, ty) => {
      const key = `${tx},${ty}`;
      const alreadySnapped = this.tilesBefore.some((s) => s.key === key);
      if (!alreadySnapped) {
        const snap = this.tiles.snapshot(tx, ty);
        if (snap) this.tilesBefore.push(snap);
      }
    });

    // Erase on each affected tile
    this.tiles.forTilesInRect(circleRect, (tile, tx, ty) => {
      const ctx = tile.ctx;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      // Convert world coords to tile-local coords
      ctx.arc(worldX - tx * TILE, worldY - ty * TILE, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      tile.dirty = true;
    }, false /* only existing tiles */);
  }

  private finishErase(): void {
    this.erasing = false;
    this.activePointerId = null;

    if (this.erasedRect && this.tilesBefore.length > 0) {
      const tilesAfter = this.tiles.snapshotRect(this.erasedRect);

      // Update inkBounds for affected tiles
      this.tiles.forTilesInRect(this.erasedRect, (_, tx, ty) => {
        this.tiles.updateInkBounds(tx, ty);
      });

      const byteSize = this.tilesBefore.reduce(
        (a, t) => a + t.data.data.byteLength,
        0
      );

      this.undoStack.push({
        tilesBefore: this.tilesBefore,
        tilesAfter,
        itemsBefore: this.getItems(),
        itemsAfter: this.getItems(),
        byteSize,
      });

      this.requestRender();
      this.onCommit();
    }

    this.erasedRect = null;
    this.tilesBefore = [];
  }

  cancel(): void {
    if (!this.erasing) return;
    this.erasing = false;
    this.activePointerId = null;
    this.erasedRect = null;
    this.tilesBefore = [];
  }
}
