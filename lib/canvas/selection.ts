import { CanvasEngine, unionRect } from "./engine";
import { TILE, SIZE } from "./constants";
import type { Point, Rect } from "./types";

function rectFromPoints(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

function clipRect(r: Rect): Rect {
  return {
    x: Math.max(0, r.x),
    y: Math.max(0, r.y),
    w: Math.max(0, Math.min(SIZE, r.x + r.w) - Math.max(0, r.x)),
    h: Math.max(0, Math.min(SIZE, r.y + r.h) - Math.max(0, r.y)),
  };
}

export function captureRegion(engine: CanvasEngine, rect: Rect): HTMLCanvasElement {
  const r = clipRect(rect);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(r.w));
  canvas.height = Math.max(1, Math.ceil(r.h));
  const ctx = canvas.getContext("2d")!;

  const x0 = Math.floor(r.x / TILE);
  const y0 = Math.floor(r.y / TILE);
  const x1 = Math.floor((r.x + r.w) / TILE);
  const y1 = Math.floor((r.y + r.h) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const c = engine.tiles.get(tx, ty);
      if (!c) continue;
      const srcX = Math.max(0, r.x - tx * TILE);
      const srcY = Math.max(0, r.y - ty * TILE);
      const srcW = Math.min(TILE, r.x + r.w - tx * TILE) - srcX;
      const srcH = Math.min(TILE, r.y + r.h - ty * TILE) - srcY;
      if (srcW <= 0 || srcH <= 0) continue;
      const dstX = Math.max(0, tx * TILE - r.x);
      const dstY = Math.max(0, ty * TILE - r.y);
      ctx.drawImage(c, srcX, srcY, srcW, srcH, dstX, dstY, srcW, srcH);
    }
  }
  return canvas;
}

export function eraseRegion(engine: CanvasEngine, rect: Rect): void {
  const r = clipRect(rect);
  const x0 = Math.floor(r.x / TILE);
  const y0 = Math.floor(r.y / TILE);
  const x1 = Math.floor((r.x + r.w) / TILE);
  const y1 = Math.floor((r.y + r.h) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const c = engine.tiles.get(tx, ty);
      if (!c) continue;
      engine.noteTileWrite(tx, ty);
      const q = c.getContext("2d")!;
      const srcX = Math.max(0, r.x - tx * TILE);
      const srcY = Math.max(0, r.y - ty * TILE);
      const srcW = Math.min(TILE, r.x + r.w - tx * TILE) - srcX;
      const srcH = Math.min(TILE, r.y + r.h - ty * TILE) - srcY;
      if (srcW <= 0 || srcH <= 0) continue;
      q.clearRect(srcX, srcY, srcW, srcH);
    }
  }
  engine.requestRender();
}

export function snapshotToDataUrl(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL("image/webp", 0.82);
  } catch {
    return canvas.toDataURL("image/png");
  }
}

export async function pasteDataUrl(engine: CanvasEngine, dataUrl: string, x: number, y: number): Promise<void> {
  if (!dataUrl) return;
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, img.width);
  canvas.height = Math.max(1, img.height);
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  pasteRegion(engine, canvas, x, y);
}

export type InkSyncOp =
  | { kind: "erase"; rect: Rect }
  | { kind: "move"; from: Rect; to: Rect; dataUrl: string };

export function pasteRegion(
  engine: CanvasEngine,
  snapshot: HTMLCanvasElement,
  x: number,
  y: number
): void {
  const w = snapshot.width;
  const h = snapshot.height;
  const x0 = Math.floor(x / TILE);
  const y0 = Math.floor(y / TILE);
  const x1 = Math.floor((x + w) / TILE);
  const y1 = Math.floor((y + h) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      engine.noteTileWrite(tx, ty);
      const c = engine.tiles.tile(tx, ty)!;
      const q = c.getContext("2d")!;
      const dstX = Math.max(0, x - tx * TILE);
      const dstY = Math.max(0, y - ty * TILE);
      const srcX = Math.max(0, tx * TILE - x);
      const srcY = Math.max(0, ty * TILE - y);
      const cutW = Math.min(TILE - dstX, w - srcX);
      const cutH = Math.min(TILE - dstY, h - srcY);
      if (cutW <= 0 || cutH <= 0) continue;
      q.drawImage(snapshot, srcX, srcY, cutW, cutH, dstX, dstY, cutW, cutH);
    }
  }
  engine.requestRender();
}

export function findInkBoundsAtPoint(engine: CanvasEngine, point: Point, hitTolerance = 12): Rect | null {
  let halfW = 600;
  let halfH = 600;
  const maxHalf = 2400;

  while (true) {
    const region = clipRect({
      x: Math.floor(point.x - halfW),
      y: Math.floor(point.y - halfH),
      w: halfW * 2,
      h: halfH * 2,
    });
    if (region.w <= 0 || region.h <= 0) return null;

    const snapshot = captureRegion(engine, region);
    const ctx = snapshot.getContext("2d");
    if (!ctx) return null;
    const width = snapshot.width;
    const height = snapshot.height;
    const data = ctx.getImageData(0, 0, width, height).data;
    const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3];

    const px = Math.round(point.x - region.x);
    const py = Math.round(point.y - region.y);
    if (px < 0 || py < 0 || px >= width || py >= height) return null;

    let start = -1;
    let bestDistance = Infinity;
    const xMin = Math.max(0, px - hitTolerance);
    const xMax = Math.min(width - 1, px + hitTolerance);
    const yMin = Math.max(0, py - hitTolerance);
    const yMax = Math.min(height - 1, py + hitTolerance);
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        if (alphaAt(x, y) <= 10) continue;
        const dx = x - px;
        const dy = y - py;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          start = y * width + x;
        }
      }
    }
    if (start === -1) return null;

    const seen = new Uint8Array(width * height);
    const queue: number[] = [start];
    seen[start] = 1;
    let foundMinX = width;
    let foundMaxX = 0;
    let foundMinY = height;
    let foundMaxY = 0;

    for (let head = 0; head < queue.length; head++) {
      const index = queue[head];
      const x = index % width;
      const y = (index - x) / width;
      if (alphaAt(x, y) <= 10) continue;
      if (x < foundMinX) foundMinX = x;
      if (x > foundMaxX) foundMaxX = x;
      if (y < foundMinY) foundMinY = y;
      if (y > foundMaxY) foundMaxY = y;
      if (x > 0) {
        const next = index - 1;
        if (!seen[next] && alphaAt(x - 1, y) > 10) { seen[next] = 1; queue.push(next); }
      }
      if (x < width - 1) {
        const next = index + 1;
        if (!seen[next] && alphaAt(x + 1, y) > 10) { seen[next] = 1; queue.push(next); }
      }
      if (y > 0) {
        const next = index - width;
        if (!seen[next] && alphaAt(x, y - 1) > 10) { seen[next] = 1; queue.push(next); }
      }
      if (y < height - 1) {
        const next = index + width;
        if (!seen[next] && alphaAt(x, y + 1) > 10) { seen[next] = 1; queue.push(next); }
      }
    }

    if (foundMinX > foundMaxX || foundMinY > foundMaxY) return null;

    const hitBorder =
      (foundMinX === 0 && region.x > 0) ||
      (foundMaxX === width - 1 && region.x + region.w < SIZE) ||
      (foundMinY === 0 && region.y > 0) ||
      (foundMaxY === height - 1 && region.y + region.h < SIZE);

    if (hitBorder && (halfW < maxHalf || halfH < maxHalf)) {
      halfW = Math.min(maxHalf, halfW * 2);
      halfH = Math.min(maxHalf, halfH * 2);
      continue;
    }

    const pad = 6;
    const w = foundMaxX - foundMinX;
    const h = foundMaxY - foundMinY;
    return {
      x: Math.max(0, region.x + foundMinX - pad),
      y: Math.max(0, region.y + foundMinY - pad),
      w: Math.max(20, w + pad * 2),
      h: Math.max(20, h + pad * 2),
    };
  }
}

export class SelectionController {
  private marquering: Point | null = null;
  private current: Point | null = null;
  private selection: { rect: Rect; snapshot: HTMLCanvasElement } | null = null;
  private moving: { id: number; start: Point; offset: Point } | null = null;
  private hasErasedOriginal = false;
  private inkListener: ((op: InkSyncOp) => void) | null = null;

  setInkListener(fn: ((op: InkSyncOp) => void) | null): void {
    this.inkListener = fn;
  }

  constructor(private engine: CanvasEngine) {
    engine.onInteractionFrame((ctx) => {
      const unit = 1 / engine.camera.scale;

      if (this.marquering && this.current) {
        const r = rectFromPoints(this.marquering, this.current);
        if (r.w >= 6 || r.h >= 6) {
          ctx.fillStyle = "#2679b822";
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeStyle = "#2679b8";
          ctx.lineWidth = unit;
          ctx.strokeRect(r.x, r.y, r.w, r.h);
        }
      }

      if (this.selection && !this.marquering) {
        const sel = this.selection;
        let drawAt: Rect = sel.rect;
        if (this.moving) {
          drawAt = {
            ...sel.rect,
            x: sel.rect.x + this.moving.offset.x,
            y: sel.rect.y + this.moving.offset.y,
          };
        }
        ctx.drawImage(sel.snapshot, drawAt.x, drawAt.y);
        ctx.strokeStyle = "#2679b8";
        ctx.lineWidth = 2 * unit;
        ctx.setLineDash([5 * unit, 4 * unit]);
        ctx.strokeRect(drawAt.x, drawAt.y, drawAt.w, drawAt.h);
        ctx.setLineDash([]);
      }
    });
  }

  get hasSelection(): boolean {
    return this.selection !== null;
  }

  get isMoving(): boolean {
    return this.moving !== null;
  }

  get rect(): Rect | null {
    return this.selection ? { ...this.selection.rect } : null;
  }

  hitTest(point: Point, tolerance = 12): boolean {
    if (!this.selection) return false;
    const s = this.selection.rect;
    const x = this.moving ? s.x + this.moving.offset.x : s.x;
    const y = this.moving ? s.y + this.moving.offset.y : s.y;
    const w = s.w;
    const h = s.h;

    const scale = this.engine.camera.scale || 1;
    const pad = Math.max(tolerance, Math.ceil(tolerance / scale));

    return (
      point.x >= x - pad &&
      point.x <= x + w + pad &&
      point.y >= y - pad &&
      point.y <= y + h + pad
    );
  }

  selectElementAtPoint(point: Point): boolean {
    if (this.selection) this.commitSelection();
    const rect = findInkBoundsAtPoint(this.engine, point);
    if (rect && rect.w > 1 && rect.h > 1) {
      this.selection = { rect, snapshot: captureRegion(this.engine, rect) };
      this.hasErasedOriginal = false;
      this.engine.requestInteractionRender({ ...rect, x: rect.x - 4, y: rect.y - 4, w: rect.w + 8, h: rect.h + 8 });
      return true;
    }
    return false;
  }

  beginMarquee(pointerId: number, world: Point): void {
    void pointerId;
    if (this.selection) this.commitSelection();
    this.marquering = world;
    this.current = world;
    this.engine.requestInteractionRender(rectFromPoints(world, world));
  }

  updateMarquee(world: Point): void {
    if (!this.marquering) return;
    const prev = this.current ?? this.marquering;
    this.current = world;
    this.engine.requestInteractionRender(
      unionRect(rectFromPoints(this.marquering, prev), rectFromPoints(this.marquering, world))
    );
  }

  endMarquee(): void {
    if (!this.marquering) return;
    const rect = rectFromPoints(this.marquering, this.current ?? this.marquering);
    this.marquering = null;
    this.current = null;
    if (rect.w >= 6 && rect.h >= 6) {
      this.selection = { rect, snapshot: captureRegion(this.engine, rect) };
      this.hasErasedOriginal = false;
    } else {
      this.clearSelection();
    }
    this.engine.requestInteractionRender(rect);
  }

  beginMove(pointerId: number, world: Point): void {
    if (!this.selection) return;
    this.moving = { id: pointerId, start: world, offset: { x: 0, y: 0 } };
    this.engine.requestInteractionRender();
  }

  private liftSelection(): void {
    if (this.hasErasedOriginal || !this.selection) return;
    eraseRegion(this.engine, this.selection.rect);
    this.hasErasedOriginal = true;
  }

  updateMove(world: Point): void {
    const m = this.moving;
    if (!m || !this.selection) return;
    const prevOffset = m.offset;
    m.offset = { x: world.x - m.start.x, y: world.y - m.start.y };
    if (Math.abs(m.offset.x) > 0.5 || Math.abs(m.offset.y) > 0.5) {
      this.liftSelection();
    }
    const s = this.selection.rect;
    this.engine.requestInteractionRender(
      unionRect(
        { x: s.x + prevOffset.x, y: s.y + prevOffset.y, w: s.w, h: s.h },
        { x: s.x + m.offset.x, y: s.y + m.offset.y, w: s.w, h: s.h }
      )
    );
  }

  endMove(): boolean {
    const m = this.moving;
    const sel = this.selection;
    if (!m || !sel) return false;
    this.moving = null;

    const moved = this.hasErasedOriginal;
    if (this.hasErasedOriginal) {
      const newX = sel.rect.x + m.offset.x;
      const newY = sel.rect.y + m.offset.y;
      const dataUrl = snapshotToDataUrl(sel.snapshot);
      pasteRegion(this.engine, sel.snapshot, newX, newY);

      const newRect = { ...sel.rect, x: newX, y: newY };
      const oldRect = { x: sel.rect.x, y: sel.rect.y, w: sel.rect.w, h: sel.rect.h };
      this.inkListener?.({ kind: "move", from: oldRect, to: newRect, dataUrl });
      this.selection = {
        rect: newRect,
        snapshot: captureRegion(this.engine, newRect),
      };
      this.hasErasedOriginal = false;
      this.engine.requestInteractionRender(unionRect(oldRect, newRect));
      return moved;
    }
    this.engine.requestInteractionRender(sel.rect);
    return moved;
  }

  commitSelection(): void {
    if (!this.selection) return;
    if (this.hasErasedOriginal) {
      pasteRegion(this.engine, this.selection.snapshot, this.selection.rect.x, this.selection.rect.y);
    }
    this.clearSelection();
  }

  deleteSelection(): void {
    if (!this.selection) return;
    const rect = { ...this.selection.rect };
    if (!this.hasErasedOriginal) {
      eraseRegion(this.engine, rect);
    }
    this.inkListener?.({ kind: "erase", rect });
    this.clearSelection();
  }

  clearSelection(): void {
    this.selection = null;
    this.moving = null;
    this.hasErasedOriginal = false;
    this.marquering = null;
    this.current = null;
    this.engine.requestInteractionRender();
  }
}