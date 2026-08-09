// ============================================================
// Drawva Canvas Engine — IndexedDB Persistence
// DB: canvas-db v1
//   - documents: { id, version, createdAt, updatedAt, previewBlob }
//   - tiles:     { id: "docId:tx,ty", blob: Blob }
//   - items:     { id: "docId:itemId", data: CanvasItem }
// ============================================================

import type { CanvasItem, CameraState } from "./types";

const DB_NAME = "canvas-db";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("documents")) {
        db.createObjectStore("documents", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("tiles")) {
        db.createObjectStore("tiles", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("items")) {
        db.createObjectStore("items", { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll<T>(
  db: IDBDatabase,
  store: string,
  prefix?: string
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => {
      let results = req.result as T[];
      if (prefix) {
        results = results.filter(
          (r) => typeof (r as Record<string, unknown>).id === "string" &&
            ((r as Record<string, unknown>).id as string).startsWith(prefix)
        );
      }
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}



export interface SavePayload {
  docId: string;
  tiles: Map<string, HTMLCanvasElement>; // tileKey → canvas
  items: CanvasItem[];
  camera: CameraState;
  previewCanvas?: HTMLCanvasElement;
}

export interface LoadResult {
  tiles: Map<string, Blob>; // tileKey → Blob
  items: CanvasItem[];
  camera?: CameraState;
}

export interface DocMeta {
  id: string;
  version: 1;
  createdAt: number;
  updatedAt: number;
}

export class Persistence {
  private db: IDBDatabase | null = null;
  private docId: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private available = true;

  constructor(docId = "default") {
    this.docId = docId;
  }

  async init(): Promise<boolean> {
    try {
      this.db = await openDB();
      return true;
    } catch (err) {
      console.warn("[Persistence] IndexedDB not available, using memory-only mode:", err);
      this.available = false;
      return false;
    }
  }

  get isAvailable(): boolean {
    return this.available && this.db !== null;
  }

  // ── Save ────────────────────────────────────────────────

  async save(payload: SavePayload): Promise<void> {
    if (!this.isAvailable) return;
    const db = this.db!;

    try {
      // Save document meta
      const existing = await idbGet<DocMeta>(db, "documents", this.docId);
      await idbPut(db, "documents", {
        id: this.docId,
        version: 1,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        camera: payload.camera,
      });

      // Save tiles as PNG blobs
      for (const [tileKey, canvas] of payload.tiles) {
        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, "image/png")
        );
        if (blob) {
          await idbPut(db, "tiles", {
            id: `${this.docId}:${tileKey}`,
            blob,
          });
        }
      }

      // Save items
      for (const item of payload.items) {
        await idbPut(db, "items", {
          id: `${this.docId}:${item.id}`,
          data: item,
        });
      }
    } catch (err) {
      console.error("[Persistence] Save failed:", err);
    }
  }

  // ── Load ────────────────────────────────────────────────

  async load(): Promise<LoadResult | null> {
    if (!this.isAvailable) return null;
    const db = this.db!;

    try {
      const meta = await idbGet<DocMeta & { camera?: CameraState }>(
        db,
        "documents",
        this.docId
      );
      if (!meta) return null;

      // Load tiles
      const tileRows = await idbGetAll<{ id: string; blob: Blob }>(
        db,
        "tiles",
        `${this.docId}:`
      );
      const tiles = new Map<string, Blob>();
      for (const row of tileRows) {
        const tileKey = row.id.slice(this.docId.length + 1);
        tiles.set(tileKey, row.blob);
      }

      // Load items
      const itemRows = await idbGetAll<{ id: string; data: CanvasItem }>(
        db,
        "items",
        `${this.docId}:`
      );
      const items = itemRows.map((r) => r.data);
      return { tiles, items, camera: meta.camera };
    } catch (err) {
      console.error("[Persistence] Load failed:", err);
      return null;
    }
  }

  // ── Clear Document ─────────────────────────────────────

  async clearDoc(): Promise<void> {
    if (!this.isAvailable) return;
    const db = this.db!;

    try {
      if (this.saveTimer !== null) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }

      // Delete tiles for this doc
      const tileRows = await idbGetAll<{ id: string }>(db, "tiles", `${this.docId}:`);
      for (const row of tileRows) {
        await new Promise<void>((res, rej) => {
          const tx = db.transaction("tiles", "readwrite");
          tx.objectStore("tiles").delete(row.id);
          tx.oncomplete = () => res();
          tx.onerror = () => rej(tx.error);
        });
      }

      // Delete items for this doc
      const itemRows = await idbGetAll<{ id: string }>(db, "items", `${this.docId}:`);
      for (const row of itemRows) {
        await new Promise<void>((res, rej) => {
          const tx = db.transaction("items", "readwrite");
          tx.objectStore("items").delete(row.id);
          tx.oncomplete = () => res();
          tx.onerror = () => rej(tx.error);
        });
      }

      // Clear document meta
      await new Promise<void>((res, rej) => {
        const tx = db.transaction("documents", "readwrite");
        tx.objectStore("documents").delete(this.docId);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    } catch (err) {
      console.error("[Persistence] clearDoc failed:", err);
    }
  }

  // ── Autosave (debounced) ────────────────────────────────

  scheduleAutosave(getPayload: () => SavePayload, delayMs = 2000): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      await this.save(getPayload());
    }, delayMs);
  }

  flushAutosave(getPayload: () => SavePayload): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.save(getPayload());
  }

  // ── Cleanup ─────────────────────────────────────────────

  destroy(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.db?.close();
    this.db = null;
  }
}
