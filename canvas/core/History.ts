import type { CanvasElement, ElementId } from "@/canvas/model/types";
import type { Scene } from "./Scene";

/**
 * Transactional, delta-based undo/redo (§53, §87, §88).
 *
 * One pointer gesture = one transaction. Elements are snapshotted when first
 * touched inside the transaction, so 100 pointermove events never produce 100
 * undo entries.
 */

export interface ElementDelta {
  id: ElementId;
  before: CanvasElement | null; // null = created
  after: CanvasElement | null; // null = deleted
}

export interface HistoryEntry {
  created: CanvasElement[];
  deleted: CanvasElement[];
  updated: { id: ElementId; before: CanvasElement; after: CanvasElement }[];
}

const MAX_STEPS = 100;

function deepClone(el: CanvasElement): CanvasElement {
  return structuredClone(el);
}

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  private recording = false;
  private touched = new Map<ElementId, CanvasElement | null>();
  /** ids of elements created inside this transaction (for undo = remove) */
  private created = new Set<ElementId>();
  private changes = false;

  /** Begin a mutation transaction (usually on pointerdown or shortcut). */
  beginTransaction(): void {
    this.recording = true;
    this.touched.clear();
    this.created.clear();
    this.changes = false;
  }

  /** Record an element that was created inside this transaction. */
  noteCreated(id: ElementId): void {
    if (this.recording) this.created.add(id);
  }

  /** Is a transaction currently open? (surfaced for nested mutations) */
  isRecording(): boolean {
    return this.recording;
  }

  /** No-op commit safety: call after mutations even without beginTransaction. */
  captureSnapshot(el: CanvasElement): void {
    if (!this.recording || this.touched.has(el.id)) return;
    this.touched.set(el.id, deepClone(el));
  }

  /** Soft-delete: element stays in scene with isDeleted=true for undoability. */
  markDeleted(el: CanvasElement): void {
    el.isDeleted = true;
    el.updated = Date.now();
  }

  commit(scene: Scene): boolean {
    const entry: HistoryEntry = { created: [], deleted: [], updated: [] };
    for (const id of this.created) {
      const after = scene.getElement(id);
      if (after && !after.isDeleted) entry.created.push(deepClone(after));
    }
    for (const [id, before] of this.touched) {
      const after = scene.getElement(id) ?? null;
      if (!before && after && !after.isDeleted) {
        entry.created.push(deepClone(after));
      } else if (before && (!after || after.isDeleted)) {
        entry.deleted.push(before);
      } else if (before && after) {
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          entry.updated.push({ id, before, after: deepClone(after) });
        }
      }
    }
    this.recording = false;
    this.touched.clear();
    this.created.clear();
    const hasOps = entry.created.length + entry.deleted.length + entry.updated.length > 0;
    if (!hasOps) return this.changes;
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_STEPS) this.undoStack.shift();
    this.redoStack = [];
    this.changes = true;
    return true;
  }

  /** Abort the active transaction without recording (click-without-move, tiny drag, Escape). */
  discardTransaction(): void {
    this.recording = false;
    this.touched.clear();
    this.created.clear();
  }

  undo(scene: Scene): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    for (const el of entry.created) scene.removeElement(el.id);
    for (const el of entry.deleted) {
      el.isDeleted = false;
      scene.addElement(deepClone(el));
    }
    for (const { before } of entry.updated) scene.replaceElement(deepClone(before));
    this.redoStack.push(entry);
    return true;
  }

  redo(scene: Scene): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    for (const el of entry.created) scene.addElement(deepClone(el));
    for (const el of entry.deleted) {
      const existing = scene.getElement(el.id);
      if (existing) existing.isDeleted = true;
    }
    for (const { after } of entry.updated) scene.replaceElement(deepClone(after));
    this.undoStack.push(entry);
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.recording = false;
    this.touched.clear();
    this.created.clear();
  }
}

export { deepClone as cloneElementDeep };
