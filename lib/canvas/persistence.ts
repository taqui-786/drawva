import { CanvasEngine } from "./engine";
import { CanvasItem } from "./types";

const DB_NAME = "drawva-canvas-db";
const DB_VERSION = 1;
const STORE_NAME = "canvas_document";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB unavailable"));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Failed to open DB"));
  });
}

function cleanItemForStorage(item: CanvasItem): Record<string, unknown> {
  const record: Record<string, unknown> = { ...item };
  delete record.image;
  delete record.shell;
  delete record.frame;
  delete record.snapshotImage;
  return record;
}

export async function saveCanvasToIndexedDb(engine: CanvasEngine): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const serializableItems = engine.items.map(cleanItemForStorage);

    const doc = {
      id: "current_document",
      camera: engine.camera.getState(),
      items: serializableItems,
      updatedAt: Date.now(),
    };

    store.put(doc);
  } catch (err) {
    console.warn("[Persistence] Failed to autosave canvas:", err);
  }
}

export async function loadCanvasFromIndexedDb(engine: CanvasEngine): Promise<boolean> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const req = store.get("current_document");
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const doc = req.result;
        if (doc && Array.isArray(doc.items)) {
          if (doc.camera) engine.camera.setState(doc.camera);
          engine.items = doc.items as CanvasItem[];
          engine.requestRender();
          resolve(true);
        } else {
          resolve(false);
        }
      };
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export function exportCanvasJson(engine: CanvasEngine, fileName: string = "drawva-canvas.json"): void {
  if (typeof document === "undefined") return;

  const data = {
    version: 1,
    appName: "Drawva",
    createdAt: new Date().toISOString(),
    camera: engine.camera.getState(),
    items: engine.items.map(cleanItemForStorage),
  };

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function importCanvasJson(engine: CanvasEngine, jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
      return false;
    }

    if (parsed.camera) engine.camera.setState(parsed.camera);
    engine.items = parsed.items as CanvasItem[];
    engine.requestRender();
    return true;
  } catch {
    return false;
  }
}
