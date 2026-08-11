import { TILE_SIZE, TileKey, ViewportBounds } from "./types";

export class TileManager {
  private tiles = new Map<TileKey, HTMLCanvasElement>();
  private tileCtxs = new Map<TileKey, CanvasRenderingContext2D>();

  public static key(tx: number, ty: number): TileKey {
    return `${tx},${ty}`;
  }

  public static parseKey(key: TileKey): { tx: number; ty: number } {
    const [tx, ty] = key.split(",").map(Number);
    return { tx, ty };
  }

  public static worldToTile(x: number, y: number): { tx: number; ty: number } {
    return {
      tx: Math.floor(x / TILE_SIZE),
      ty: Math.floor(y / TILE_SIZE),
    };
  }

  public getTile(tx: number, ty: number, create: boolean = true): HTMLCanvasElement | null {
    const k = TileManager.key(tx, ty);
    if (!this.tiles.has(k) && create) {
      if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          this.tiles.set(k, canvas);
          this.tileCtxs.set(k, ctx);
        }
      }
    }
    return this.tiles.get(k) || null;
  }

  public getTileContext(tx: number, ty: number, create: boolean = true): CanvasRenderingContext2D | null {
    const k = TileManager.key(tx, ty);
    if (!this.tileCtxs.has(k)) {
      this.getTile(tx, ty, create);
    }
    return this.tileCtxs.get(k) || null;
  }

  public getVisibleTileKeys(bounds: ViewportBounds): TileKey[] {
    const minTile = TileManager.worldToTile(bounds.minX, bounds.minY);
    const maxTile = TileManager.worldToTile(bounds.maxX, bounds.maxY);
    const keys: TileKey[] = [];

    for (let tx = minTile.tx; tx <= maxTile.tx; tx++) {
      for (let ty = minTile.ty; ty <= maxTile.ty; ty++) {
        keys.push(TileManager.key(tx, ty));
      }
    }
    return keys;
  }

  public getActiveTiles(): Map<TileKey, HTMLCanvasElement> {
    return this.tiles;
  }

  public clear(): void {
    this.tiles.clear();
    this.tileCtxs.clear();
  }

  public drawTileToContext(
    targetCtx: CanvasRenderingContext2D,
    tx: number,
    ty: number
  ): void {
    const tileCanvas = this.getTile(tx, ty, false);
    if (tileCanvas) {
      targetCtx.drawImage(tileCanvas, tx * TILE_SIZE, ty * TILE_SIZE);
    }
  }
}
