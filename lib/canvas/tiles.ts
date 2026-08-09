// ============================================================
// Drawva Canvas Engine — Sparse Tile System
// World divided into TILE×TILE cells. Only tiles with ink are
// created. Keyed by "tx,ty". Mirrors PenEcho's tile() model.
// ============================================================

import type { Rect, TileKey, TileSnapshot } from "./types";

/** World size in logical units (matches PenEcho) */
export const WORLD_SIZE = 20000;
/** Tile size in logical units / CSS pixels */
export const TILE = 512;

function key(tx: number, ty: number): TileKey {
  return `${tx},${ty}`;
}

function fromKey(k: TileKey): [number, number] {
  const [tx, ty] = k.split(",").map(Number);
  return [tx, ty];
}

export interface TileInfo {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** min/max pixel coords of non-transparent pixels within this tile */
  inkMinX: number;
  inkMinY: number;
  inkMaxX: number;
  inkMaxY: number;
  dirty: boolean;
}

export class TileMap {
  private tiles = new Map<TileKey, TileInfo>();
  private dpr: number;

  constructor(dpr = 1) {
    this.dpr = dpr;
  }

  setDpr(dpr: number): void {
    this.dpr = dpr;
  }

  /**
   * Get or create a tile at tile indices (tx, ty).
   * Returns undefined if create=false and tile doesn't exist.
   */
  get(tx: number, ty: number, create = true): TileInfo | undefined {
    const k = key(tx, ty);
    if (!this.tiles.has(k)) {
      if (!create) return undefined;
      const canvas = document.createElement("canvas");
      const size = TILE * this.dpr;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.scale(this.dpr, this.dpr);
      const info: TileInfo = {
        canvas,
        ctx,
        inkMinX: TILE,
        inkMinY: TILE,
        inkMaxX: 0,
        inkMaxY: 0,
        dirty: false,
      };
      this.tiles.set(k, info);
    }
    return this.tiles.get(k)!;
  }

  has(tx: number, ty: number): boolean {
    return this.tiles.has(key(tx, ty));
  }

  /**
   * Call fn(tileInfo, tx, ty) for every tile that intersects
   * the given world rect. Only existing tiles unless create=true.
   */
  forTilesInRect(
    rect: Rect,
    fn: (tile: TileInfo, tx: number, ty: number) => void,
    create = false
  ): void {
    if (rect.w <= 0 || rect.h <= 0) return;

    const x0 = Math.floor(rect.x / TILE);
    const y0 = Math.floor(rect.y / TILE);
    const x1 = Math.floor((rect.x + rect.w) / TILE);
    const y1 = Math.floor((rect.y + rect.h) / TILE);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = this.get(tx, ty, create);
        if (tile) fn(tile, tx, ty);
      }
    }
  }

  /**
   * Call fn(tileInfo, tx, ty) for every existing tile — used for
   * rendering all tiles, saving, computing global inkBounds.
   */
  forEachExisting(fn: (tile: TileInfo, tx: number, ty: number) => void): void {
    for (const [k, tile] of this.tiles) {
      const [tx, ty] = fromKey(k);
      fn(tile, tx, ty);
    }
  }

  /** Snapshot tile pixel data (for undo). */
  snapshot(tx: number, ty: number): TileSnapshot | null {
    const tile = this.get(tx, ty, false);
    if (!tile) return null;
    const data = tile.ctx.getImageData(0, 0, TILE, TILE);
    return { key: key(tx, ty), data };
  }

  /** Snapshot all tiles intersecting a rect (for undo). */
  snapshotRect(rect: Rect): TileSnapshot[] {
    const snapshots: TileSnapshot[] = [];
    this.forTilesInRect(rect, (_, tx, ty) => {
      const s = this.snapshot(tx, ty);
      if (s) snapshots.push(s);
    });
    return snapshots;
  }

  /** Restore tile from snapshot. */
  restore(snapshot: TileSnapshot): void {
    const [tx, ty] = fromKey(snapshot.key);
    const tile = this.get(tx, ty, true)!;
    tile.ctx.putImageData(snapshot.data, 0, 0);
    tile.dirty = true;
  }

  /** Compute world-space bounding rect of all ink across all tiles */
  globalInkBounds(): Rect | null {
    let minX = WORLD_SIZE,
      minY = WORLD_SIZE,
      maxX = 0,
      maxY = 0;
    let found = false;

    this.forEachExisting((tile, tx, ty) => {
      if (tile.inkMaxX <= tile.inkMinX || tile.inkMaxY <= tile.inkMinY) return;
      found = true;
      minX = Math.min(minX, tx * TILE + tile.inkMinX);
      minY = Math.min(minY, ty * TILE + tile.inkMinY);
      maxX = Math.max(maxX, tx * TILE + tile.inkMaxX);
      maxY = Math.max(maxY, ty * TILE + tile.inkMaxY);
    });

    if (!found) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /** Scan a tile's pixels to update inkBounds for that tile. */
  updateInkBounds(tx: number, ty: number): void {
    const tile = this.get(tx, ty, false);
    if (!tile) return;
    const data = tile.ctx.getImageData(0, 0, TILE, TILE).data;
    let minX = TILE, minY = TILE, maxX = 0, maxY = 0;

    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const a = data[(y * TILE + x) * 4 + 3];
        if (a > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    tile.inkMinX = minX;
    tile.inkMinY = minY;
    tile.inkMaxX = maxX;
    tile.inkMaxY = maxY;
  }

  /** Clear all tiles (for "clear all" operation) */
  clearAll(): void {
    for (const tile of this.tiles.values()) {
      tile.ctx.clearRect(0, 0, TILE, TILE);
      tile.inkMinX = TILE;
      tile.inkMinY = TILE;
      tile.inkMaxX = 0;
      tile.inkMaxY = 0;
      tile.dirty = true;
    }
  }

  /** Evict a specific tile (frees memory) */
  evict(tx: number, ty: number): void {
    this.tiles.delete(key(tx, ty));
  }

  get size(): number {
    return this.tiles.size;
  }

  /** Export tile to PNG blob */
  async toBlob(tx: number, ty: number): Promise<Blob | null> {
    const tile = this.get(tx, ty, false);
    if (!tile) return null;
    return new Promise((resolve) => tile.canvas.toBlob(resolve, "image/png"));
  }

  /** Load blob into tile */
  async fromBlob(tx: number, ty: number, blob: Blob): Promise<void> {
    const tile = this.get(tx, ty, true)!;
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve) => {
      img.onload = () => {
        tile.ctx.clearRect(0, 0, TILE, TILE);
        tile.ctx.drawImage(img, 0, 0, TILE, TILE);
        URL.revokeObjectURL(url);
        resolve();
      };
    });
    this.updateInkBounds(tx, ty);
    tile.dirty = true;
  }

  /** All existing tile keys */
  keys(): TileKey[] {
    return [...this.tiles.keys()];
  }
}
