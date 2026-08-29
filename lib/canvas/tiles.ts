import { SIZE, TILE } from "./constants";
import type { Rect } from "./types";
import { tileKey } from "./types";

export class TileCache {
  private tiles = new Map<string, HTMLCanvasElement>();
  private dataUrlCache = new Map<string, string>();

  tile(tx: number, ty: number, create = true): HTMLCanvasElement | null {
    const k = tileKey(tx, ty);
    if (!this.tiles.has(k) && create) {
      const c = document.createElement("canvas");
      c.width = TILE;
      c.height = TILE;
      this.tiles.set(k, c);
      this.dataUrlCache.delete(k);
    }
    return this.tiles.get(k) ?? null;
  }

  markDirty(tx: number, ty: number): void {
    this.dataUrlCache.delete(tileKey(tx, ty));
  }

  markDirtyKey(k: string): void {
    this.dataUrlCache.delete(k);
  }

  getDataUrl(k: string): string | null {
    const cached = this.dataUrlCache.get(k);
    if (cached !== undefined) return cached;
    const [tx, ty] = k.split(",").map(Number);
    const c = this.get(tx, ty);
    if (!c) return null;
    try {
      const url = c.toDataURL("image/png");
      this.dataUrlCache.set(k, url);
      return url;
    } catch {
      return null;
    }
  }

  get(tx: number, ty: number): HTMLCanvasElement | null {
    return this.tiles.get(tileKey(tx, ty)) ?? null;
  }

  keys(): string[] {
    return [...this.tiles.keys()];
  }

  set(key: string, canvas: HTMLCanvasElement, dataUrl?: string): void {
    this.tiles.set(key, canvas);
    if (dataUrl) {
      this.dataUrlCache.set(key, dataUrl);
    } else {
      this.dataUrlCache.delete(key);
    }
  }

  delete(key: string): void {
    this.tiles.delete(key);
    this.dataUrlCache.delete(key);
  }

  clear(): void {
    this.tiles.clear();
    this.dataUrlCache.clear();
  }

  forTiles(
    rect: Rect,
    fn: (canvas: HTMLCanvasElement, tx: number, ty: number) => void,
    create = true
  ): void {
    if (rect.w <= 0 || rect.h <= 0) return;
    const maxIdx = Math.ceil(SIZE / TILE) - 1;
    const x0 = Math.max(0, Math.floor(rect.x / TILE));
    const y0 = Math.max(0, Math.floor(rect.y / TILE));
    const x1 = Math.min(maxIdx, Math.ceil((rect.x + rect.w) / TILE) - 1);
    const y1 = Math.min(maxIdx, Math.ceil((rect.y + rect.h) / TILE) - 1);
    if (x1 < x0 || y1 < y0) return;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const c = this.tile(tx, ty, create);
        if (c) fn(c, tx, ty);
      }
    }
  }
}
