import { CanvasEngine } from "./engine";
import { TILE } from "./constants";
import { WidgetManager, type WidgetItem } from "./widgets";
import { ObjectManager, type ObjectItem } from "./objects";
import { renderTextBlock } from "./textTool";
import { renderFormula } from "./formulas";
import { plotCommand } from "./plotter";
import { renderWidgetToContext } from "./atlas";
import { renderAnimationScene } from "./animation";

export interface ProjectSnapshot {
  version: 1;
  savedAt: number;
  tiles: Record<string, string>;
  widgets: WidgetItem[];
  objects: ObjectItem[];
}

const DB_NAME = "drawva-canvas-db";
const STORE = "documents";
const KEY = "autosave";

export function computeSnapshotHash(snapshot: ProjectSnapshot | null): string {
  if (!snapshot) return "empty";
  let hash = 2166136261;
  const mix = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  };

  const tileKeys = Object.keys(snapshot.tiles || {}).sort();
  mix(`tiles:${tileKeys.length}`);
  for (const k of tileKeys) {
    const data = snapshot.tiles[k] || "";
    mix(k);
    mix(String(data.length));
    if (data.length > 64) {
      mix(data.slice(0, 32));
      mix(data.slice(-32));
    } else {
      mix(data);
    }
  }

  const widgets = snapshot.widgets || [];
  mix(`w:${widgets.length}`);
  for (const w of widgets) {
    mix(`${w.id}:${w.kind}:${Math.round(w.x)}:${Math.round(w.y)}:${Math.round(w.w)}:${Math.round(w.h)}:${w.title || ""}`);
    const content = w.html || w.copyText || "";
    mix(String(content.length));
    if (content.length > 64) {
      mix(content.slice(0, 32));
      mix(content.slice(-32));
    } else {
      mix(content);
    }
  }

  const objects = snapshot.objects || [];
  mix(`o:${objects.length}`);
  for (const o of objects) {
    mix(`${o.id}:${o.kind}:${Math.round(o.x)}:${Math.round(o.y)}:${Math.round(o.w)}:${Math.round(o.h)}:${o.color || ""}`);
    const src = o.source || "";
    mix(String(src.length));
    if (src.length > 64) {
      mix(src.slice(0, 32));
      mix(src.slice(-32));
    } else {
      mix(src);
    }
  }

  return (hash >>> 0).toString(16);
}

export function serializeSnapshot(
  engine: CanvasEngine,
  widgets: WidgetManager | null,
  objects: ObjectManager | null
): ProjectSnapshot {
  const tiles: Record<string, string> = {};
  for (const k of engine.tiles.keys()) {
    const dataUrl = engine.tiles.getDataUrl(k);
    if (dataUrl) {
      tiles[k] = dataUrl;
    }
  }
  return {
    version: 1,
    savedAt: Date.now(),
    tiles,
    widgets: widgets
      ? widgets.all().map((w) => {
          const { cachedImage, ...rest } = w;
          void cachedImage;
          return rest;
        })
      : [],
    objects: objects
      ? objects.all().map((o) => {
          const { image, ...rest } = o;
          void image;
          return rest;
        })
      : [],
  };
}

function parseKey(k: string): [number, number] {
  const [a, b] = k.split(",").map(Number);
  return [a, b];
}

export async function applyTiles(engine: CanvasEngine, tiles: Record<string, string>): Promise<void> {
  for (const [k, dataUrl] of Object.entries(tiles || {})) {
    if (!dataUrl) continue;
    const [tx, ty] = parseKey(k);
    const c = engine.tiles.tile(tx, ty);
    if (!c) continue;
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const ctx = c.getContext("2d");
    if (!ctx) continue;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    engine.tiles.set(k, c, dataUrl);
  }
  engine.requestRender();
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
    engine.tiles.set(k, c, dataUrl);
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
    if (o.kind === "animation") {
      let scene = o.animationScene;
      if (!scene && o.source) {
        try {
          scene = JSON.parse(o.source);
        } catch {}
      }
      return {
        ...base,
        contentW: o.w,
        contentH: o.h,
        animationScene: scene,
        paused: o.paused ?? false,
        playheadMs: o.playheadMs ?? 0,
        startedAt: performance.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
  } catch {}
}

export async function saveAgentSession(messages: unknown[], canvasId?: string): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) return;
  try {
    const db = await openDb();
    const key = canvasId ? `session:${canvasId}` : "session:autosave";
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(messages, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

export async function loadAgentSession(canvasId?: string): Promise<unknown[] | null> {
  if (typeof window === "undefined" || !window.indexedDB) return null;
  try {
    const db = await openDb();
    const key = canvasId ? `session:${canvasId}` : "session:autosave";
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        db.close();
        resolve(Array.isArray(req.result) ? req.result : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearAgentSession(canvasId?: string): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) return;
  try {
    const db = await openDb();
    const key = canvasId ? `session:${canvasId}` : "session:autosave";
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
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

export async function exportPng(
  engine: CanvasEngine,
  widgets: WidgetManager | null = null,
  objects: ObjectManager | null = null
): Promise<void> {
  const keys = engine.tiles.keys();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const k of keys) {
    const [tx, ty] = parseKey(k);
    minX = Math.min(minX, tx * TILE);
    minY = Math.min(minY, ty * TILE);
    maxX = Math.max(maxX, (tx + 1) * TILE);
    maxY = Math.max(maxY, (ty + 1) * TILE);
  }

  const widgetList = widgets ? widgets.all() : [];
  for (const w of widgetList) {
    minX = Math.min(minX, w.x);
    minY = Math.min(minY, w.y);
    maxX = Math.max(maxX, w.x + w.w);
    maxY = Math.max(maxY, w.y + w.h);
  }

  const objectList = objects ? objects.all() : [];
  for (const o of objectList) {
    minX = Math.min(minX, o.x);
    minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + o.w);
    maxY = Math.max(maxY, o.y + o.h);
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;

  const pad = 32;
  const worldW = Math.ceil(maxX - minX) + pad * 2;
  const worldH = Math.ceil(maxY - minY) + pad * 2;
  const originX = minX - pad;
  const originY = minY - pad;

  const out = document.createElement("canvas");
  out.width = worldW;
  out.height = worldH;
  const q = out.getContext("2d")!;
  q.fillStyle = "#fff";
  q.fillRect(0, 0, out.width, out.height);
  q.setTransform(1, 0, 0, 1, -originX, -originY);

  for (const k of keys) {
    const [tx, ty] = parseKey(k);
    const c = engine.tiles.get(tx, ty);
    if (c) q.drawImage(c, tx * TILE, ty * TILE);
  }

  if (widgets) {
    await Promise.all(widgetList.map((w) => widgets.refreshSnapshot(w.id, 1100)));
  }
  for (const w of widgetList) {
    await renderWidgetToContext(w, q);
  }

  for (const o of objectList) {
    if (o.image) {
      q.drawImage(o.image, o.x, o.y, o.w, o.h);
    } else if (o.kind === "animation" && o.animationScene) {
      q.save();
      q.translate(o.x, o.y);
      q.scale(o.w / o.animationScene.w, o.h / o.animationScene.h);
      renderAnimationScene(q, o.animationScene, o.playheadMs ?? 0);
      q.restore();
    }
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
