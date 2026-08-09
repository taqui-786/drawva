// ============================================================
// Drawva Canvas Engine — Undo / Redo Stack
// Snapshot undo/redo. Before & after state stored per record.
// Max ~50 records; byte cap ~64MB total.
// ============================================================

import type { CanvasItem, UndoRecord } from "./types";

const MAX_RECORDS = 50;
const MAX_BYTES = 64 * 1024 * 1024; // 64 MB

export class UndoStack {
  private past: UndoRecord[] = [];
  private future: UndoRecord[] = [];
  private totalBytes = 0;

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Push a new operation record to history.
   * Invalidates redo stack.
   */
  push(record: UndoRecord): void {
    this.future = [];
    this.past.push(record);
    this.totalBytes += record.byteSize;
    this.evict();
  }

  /** Push an item-only change (adding/deleting shapes, text, images) */
  pushItemsChange(itemsBefore: CanvasItem[], itemsAfter: CanvasItem[]): void {
    this.push({
      tilesBefore: [],
      tilesAfter: [],
      itemsBefore: [...itemsBefore],
      itemsAfter: [...itemsAfter],
      byteSize: 100,
    });
  }

  /**
   * Undo. Pops from past, pushes to future, returns the record.
   */
  undo(): UndoRecord | null {
    const record = this.past.pop();
    if (!record) return null;

    this.future.push(record);
    return record;
  }

  /**
   * Redo. Pops from future, pushes to past, returns the record.
   */
  redo(): UndoRecord | null {
    const record = this.future.pop();
    if (!record) return null;

    this.past.push(record);
    return record;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.totalBytes = 0;
  }

  private evict(): void {
    while (
      this.past.length > MAX_RECORDS ||
      this.totalBytes > MAX_BYTES
    ) {
      const dropped = this.past.shift();
      if (!dropped) break;
      this.totalBytes -= dropped.byteSize;
    }
    if (this.totalBytes < 0) this.totalBytes = 0;
  }
}
