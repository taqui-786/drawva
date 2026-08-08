import { AUTOSAVE_DEBOUNCE_MS, LOCAL_STORAGE_KEY } from "@canvas/constants/defaults";
import type { Camera, CanvasDocument, CanvasElement } from "@/canvas/model/types";
import { restoreDocument } from "./deserializer";
import { serializeDocument } from "./serializer";

/**
 * Local-first autosave (§78). Debounced so pointermove bursts don't serialize
 * the scene every frame. localStorage is the interim store; IndexedDB swaps in
 * later behind this same interface.
 */
export class LocalPersistence {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: CanvasDocument | null = null;

  saveDebounced(
    elements: CanvasElement[],
    camera: Camera,
    canvasBackground: string,
  ): void {
    this.pending = serializeDocument(elements, camera, canvasBackground);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), AUTOSAVE_DEBOUNCE_MS);
  }

  flush(): void {
    if (!this.pending) return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.pending));
    } catch {
      // quota/private mode — autosave is best-effort
    }
    this.pending = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  load(): { elements: CanvasElement[]; camera: Camera; canvasBackground: string } | null {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const restored = restoreDocument(parsed);
    if (restored.errors.length > 0 && restored.elements.length === 0 && !raw.includes('"elements"')) {
      return null;
    }
    return restored;
  }

  clear(): void {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
