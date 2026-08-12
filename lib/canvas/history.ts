import type { CanvasEngine } from "./engine";
import type { WidgetItem, WidgetManager } from "./widgets";
import type { ObjectItem, ObjectManager } from "./objects";
import { renderObject } from "./persistence";

export const MAX_HISTORY = 30;

export function cloneCanvas(c: HTMLCanvasElement | null | undefined): HTMLCanvasElement | null {
  if (!c) return null;
  const d = document.createElement("canvas");
  d.width = c.width;
  d.height = c.height;
  d.getContext("2d")!.drawImage(c, 0, 0);
  return d;
}

export interface TileChange {
  /** "tx,ty" tile key. */
  k: string;
  /** Pre-edit bitmap (null if the tile did not exist yet). */
  before: HTMLCanvasElement | null;
  /** Post-edit bitmap (null if the tile was removed). */
  after: HTMLCanvasElement | null;
}

export interface HistoryEntry {
  tiles: TileChange[];
  widgetsBefore: WidgetItem[] | null;
  widgetsAfter: WidgetItem[] | null;
  objectsBefore: ObjectItem[] | null;
  objectsAfter: ObjectItem[] | null;
}

function parseKey(k: string): [number, number] {
  const [tx, ty] = k.split(",").map(Number);
  return [tx, ty];
}

/** Objects are stored without their raster (bitmaps are re-rendered from source). */
function serializeObjects(om: ObjectManager): ObjectItem[] {
  return om.all().map((o) => {
    const { image, ...rest } = o;
    void image;
    return rest;
  });
}

/**
 * Diff-based drawing history — port of penecho persistence.js history.
 *
 * Instead of snapshot-serializing the entire board on every change (#4 →
 * full-snapshot undo, 20 entries), we lazily clone each tile the first time it
 * is written during an edit session (Penecho's recordBefore), then at commit
 * time capture the "after" bitmaps for *those tiles only*. Objects/widgets
 * (which carry just a handful of records) are captured as whole serialized
 * arrays on first mutation. One gesture ⇒ one history entry, capped at 30.
 *
 * Tiles are journaled through `engine.noteTileWrite(tx, ty)`, which the React
 * shell binds to `recordTileBefore`; widgets/objects are journaled through
 * `recordWidgets()` / `recordObjects()` called at gesture start.
 */
export class BoardHistory {
  private capturedTiles = new Map<string, HTMLCanvasElement | null>();
  private widgetsBefore: WidgetItem[] | null = null;
  private objectsBefore: ObjectItem[] | null = null;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private engine: CanvasEngine | null = null;
  private widgets: WidgetManager | null = null;
  private objects: ObjectManager | null = null;

  bind(engine: CanvasEngine, widgets: WidgetManager, objects: ObjectManager): void {
    this.engine = engine;
    this.widgets = widgets;
    this.objects = objects;
  }

  get canUndo(): boolean {
    return (
      this.undoStack.length > 0 ||
      this.capturedTiles.size > 0 ||
      this.widgetsBefore !== null ||
      this.objectsBefore !== null
    );
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Lazy before-capture: clone a tile the first time it is touched this session. */
  recordTileBefore(tx: number, ty: number): void {
    const k = `${tx},${ty}`;
    if (this.capturedTiles.has(k)) return;
    const c = this.engine?.tiles.get(tx, ty) ?? null;
    this.capturedTiles.set(k, cloneCanvas(c));
  }

  recordWidgets(): void {
    if (!this.widgets || this.widgetsBefore) return;
    this.widgetsBefore = this.widgets.all().map((w) => ({ ...w }));
  }

  recordObjects(): void {
    if (!this.objects || this.objectsBefore) return;
    this.objectsBefore = serializeObjects(this.objects);
  }

  /** Penecho save(): collapse journaled changes into one history entry. */
  commit(): void {
    const eng = this.engine;
    if (!eng) return;
    if (this.capturedTiles.size === 0 && this.widgetsBefore === null && this.objectsBefore === null) {
      return;
    }
    const tiles: TileChange[] = [];
    for (const [k, before] of this.capturedTiles) {
      const [tx, ty] = parseKey(k);
      const after = eng.tiles.get(tx, ty);
      tiles.push({ k, before, after: cloneCanvas(after) });
    }
    this.capturedTiles.clear();
    this.undoStack.push({
      tiles,
      widgetsBefore: this.widgetsBefore,
      widgetsAfter: this.widgetsBefore && this.widgets ? this.widgets.all().map((w) => ({ ...w })) : null,
      objectsBefore: this.objectsBefore,
      objectsAfter: this.objectsBefore && this.objects ? serializeObjects(this.objects) : null,
    });
    this.widgetsBefore = null;
    this.objectsBefore = null;
    this.redoStack = [];
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
  }

  /** Record the entire board as the "before" state (used by Clear). */
  captureWholeBoard(): void {
    const eng = this.engine;
    if (!eng) return;
    for (const k of eng.tiles.keys()) {
      if (this.capturedTiles.has(k)) continue;
      const [tx, ty] = parseKey(k);
      const c = eng.tiles.get(tx, ty);
      this.capturedTiles.set(k, cloneCanvas(c));
    }
    this.recordWidgets();
    this.recordObjects();
  }

  async undo(): Promise<boolean> {
    // Flush any in-progress gesture so it becomes its own undoable entry.
    this.commit();
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push(entry);
    await this.apply(entry, "before");
    return true;
  }

  async redo(): Promise<boolean> {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push(entry);
    await this.apply(entry, "after");
    return true;
  }

  reset(): void {
    this.capturedTiles.clear();
    this.widgetsBefore = null;
    this.objectsBefore = null;
    this.undoStack = [];
    this.redoStack = [];
  }

  private async apply(entry: HistoryEntry, side: "before" | "after"): Promise<void> {
    const eng = this.engine;
    if (!eng) return;
    for (const c of entry.tiles) {
      const value = c[side];
      if (value) {
        const copy = cloneCanvas(value as HTMLCanvasElement);
        if (copy) eng.tiles.set(c.k, copy);
        else eng.tiles.delete(c.k);
      } else eng.tiles.delete(c.k);
    }
    const widgets = side === "before" ? entry.widgetsBefore : entry.widgetsAfter;
    if (widgets && this.widgets) {
      this.widgets.clear();
      for (const w of widgets) this.widgets.add({ ...w });
    }
    const objects = side === "before" ? entry.objectsBefore : entry.objectsAfter;
    if (objects && this.objects) {
      this.objects.clear();
      for (const o of objects) {
        const restored = await renderObject(eng, o);
        if (restored) this.objects.add(restored);
      }
    }
    eng.requestRender();
    this.widgets?.sync();
    this.objects?.sync();
  }
}