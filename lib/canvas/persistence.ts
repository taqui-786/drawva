import { CanvasEngine } from "./engine";
import { TILE } from "./constants";
import { WidgetManager, type WidgetItem } from "./widgets";
import { ObjectManager, type ObjectItem } from "./objects";
import { renderTextBlock } from "./textTool";
import { renderFormula } from "./formulas";
import { plotCommand } from "./plotter";

// ============================================================================
// Persistence: IndexedDB autosave + PNG export + project JSON import/export.
// Tiles are serialized as PNG dataURLs keyed by "tx,ty". Widgets and living
// objects as plain JSON (object bitmaps are re-rendered from source on load).
// ============================================================================

export interface ProjectSnapshot {
  version: 1;
  savedAt: number;
  tiles: Record<string, string>; // key -> dataURL
  widgets: WidgetItem[];
  objects: ObjectItem[];
}

const DB_NAME = "drawva-canvas-db";
const STORE = "documents";
const KEY = "autosave";

export function serializeSnapshot(
  engine: CanvasEngine,
  widgets: WidgetManager | null,
  objects: ObjectManager | null
): ProjectSnapshot {
  const tiles: Record<string, string> = {};
  for (const k of engine.tiles.keys()) {
    const c = engine.tiles.get(...parseKey(k));
    if (c) {
      try {
        tiles[k] = c.toDataURL("image/png");
      } catch {
        // skip unreadable tiles
      }
    }
  }
  return {
    version: 1,
    savedAt: Date.now(),
    tiles,
    widgets: widgets ? widgets.all().map((w) => ({ ...w })) : [],
    objects: objects
      ? objects.all().map((o) => {
          const { image, ...rest } = o;
          void image; // bitmaps are re-rendered from source on restore
          return rest;
        })
      : [],
  };
}

function parseKey(k: string): [number, number] {
  const [a, b] = k.split(",").map(Number);
  return [a, b];
}

export async function restoreSnapshot(
  engine: CanvasEngine,
  widgets: WidgetManager | null,
  objects: ObjectManager | null,
  snapshot: ProjectSnapshot
): Promise<void> {
  engine.tiles.clear();
  widgets?.clear();
  objects?.clear();
  const entries = Object.entries(snapshot.tiles || {});
  for (const [k, dataUrl] of entries) {
    const [tx, ty] = parseKey(k);
    const c = engine.tiles.tile(tx, ty);
    if (!c) continue;
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    c.getContext("2d")!.drawImage(img, 0, 0);
  }
  for (const w of snapshot.widgets || []) {
    widgets?.add({ ...w });
  }
  for (const o of snapshot.objects || []) {
    const restored = await renderObject(engine, o);
    if (restored) objects?.add(restored);
  }
  engine.requestRender();
  widgets?.sync();
  objects?.sync();
}

/** Re-rasterize a persisted living object from its source data. */
export async function renderObject(
  engine: CanvasEngine,
  o: ObjectItem
): Promise<ObjectItem | null> {
  const base: ObjectItem = { ...o, image: undefined };
  try {
    if (o.kind === "text") {
      const r = renderTextBlock(o.source, o.color, o.fontSize, o.maxWidth ?? Math.max(o.fontSize, o.w));
      return { ...base, image: r.canvas, contentW: r.w, contentH: r.h };
    }
    if (o.kind === "formula") {
      const r = await renderFormula(o.source, o.fontSize, o.color);
      if (r.canvas.width <= 0 || r.canvas.height <= 0) return null;
      base.contentW = r.canvas.width;
      base.contentH = r.canvas.height;
      return { ...base, image: r.canvas };
    }
    if (o.kind === "plot") {
      const canvas = plotCommand({
        tool: "plot_function",
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        expression: o.source,
        color: o.color,
      });
      if (canvas.width <= 0 || canvas.height <= 0) return null;
      return { ...base, image: canvas, contentW: o.w, contentH: o.h };
    }
    return null;
  } catch {
    return null;
  }
}

// ---- IndexedDB ----

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Version 2 ensures onupgradeneeded always runs (creating the store if a
    // stale v1 DB exists without one).
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAutosave(snapshot: ProjectSnapshot): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(snapshot, KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore autosave failures (private mode / quota)
  }
}

export async function loadAutosave(): Promise<ProjectSnapshot | null> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as ProjectSnapshot) ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

// ---- PNG export ----

export function exportPng(engine: CanvasEngine): void {
  const keys = engine.tiles.keys();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const k of keys) {
    const [tx, ty] = parseKey(k);
    minX = Math.min(minX, tx);
    minY = Math.min(minY, ty);
    maxX = Math.max(maxX, tx);
    maxY = Math.max(maxY, ty);
  }
  if (!keys.length) return;
  const out = document.createElement("canvas");
  out.width = (maxX - minX + 1) * TILE;
  out.height = (maxY - minY + 1) * TILE;
  const q = out.getContext("2d")!;
  q.fillStyle = "#fff";
  q.fillRect(0, 0, out.width, out.height);
  for (const k of keys) {
    const [tx, ty] = parseKey(k);
    const c = engine.tiles.get(tx, ty);
    if (c) q.drawImage(c, (tx - minX) * TILE, (ty - minY) * TILE);
  }
  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drawva.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, "image/png");
}

// ---- Project JSON import/export ----

export function exportJson(
  engine: CanvasEngine,
  widgets: WidgetManager | null,
  objects: ObjectManager | null
): void {
  const snapshot = serializeSnapshot(engine, widgets, objects);
  const text = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "drawva-project.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function importJson(
  engine: CanvasEngine,
  widgets: WidgetManager | null,
  objects: ObjectManager | null,
  file: File
): Promise<void> {
  const text = await file.text();
  const snapshot = JSON.parse(text) as ProjectSnapshot;
  if (!snapshot || snapshot.version !== 1) throw new Error("Unsupported project file");
  await restoreSnapshot(engine, widgets, objects, snapshot);
}
