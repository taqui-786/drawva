import type { CanvasEngine } from "./engine";
import type { WidgetManager } from "./widgets";
import type { ObjectManager } from "./objects";

/** FNV-1a — cheap enough to run on every optimistic-concurrency check. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Content fingerprint of the board.
 *
 * The board *revision* is a call counter: it advances on every
 * `afterBoardChange()`, including calls that leave the content untouched
 * (iframe layout self-fit, gesture handlers that end without a drag, camera
 * work, autosave bookkeeping). Using it alone to reject an agent mutation
 * produces REVISION_CONFLICT storms where nothing actually changed.
 *
 * This fingerprint covers only what invalidates an agent's plan: which items
 * exist, what they are, and whether their content or the raster ink changed.
 * Geometry is deliberately EXCLUDED — a widget that self-fits its own content
 * a few hundred px between two steps must not reject a valid delete or move,
 * and every agent geometry op is either relative (move dx/dy) or absolute
 * (resize w/h), so both compose safely with a concurrent layout shift.
 *
 * `inkEpoch` must advance on every raster mutation (tile write, undo, redo);
 * hashing the tile bitmaps themselves would be far too expensive per check.
 */
export function boardFingerprint(
  engine: CanvasEngine,
  widgets: WidgetManager | null,
  objects: ObjectManager | null,
  inkEpoch: number
): string {
  const parts: string[] = [`i${inkEpoch}`, `t${engine.tiles.keys().length}`];
  for (const w of widgets?.all() ?? []) {
    parts.push(`w:${w.id}:${w.kind}:${w.status}:${w.html.length}:${(w.copyText ?? "").length}`);
  }
  for (const o of objects?.all() ?? []) {
    parts.push(`o:${o.id}:${o.kind}:${o.status}:${o.source.length}`);
  }
  return fnv1a(parts.join("|")).toString(36);
}

/**
 * Signature of a fixed set of item ids — the items that already existed when a
 * mutation started, minus the ones the mutation itself targets. Comparing this
 * across an async apply gap detects a *foreign* change (the user deleted or
 * edited something mid-apply) without tripping over the apply's own writes:
 * items the apply creates are absent from the id set, so they never register.
 * A missing id keeps its slot, so a concurrent delete still shows up.
 */
export function trackedSceneSignature(
  widgets: WidgetManager,
  objects: ObjectManager,
  ids: readonly string[]
): string {
  const parts: string[] = [];
  for (const id of ids) {
    const w = widgets.get(id);
    if (w) {
      parts.push(`w:${id}:${w.status}:${w.html.length}`);
      continue;
    }
    const o = objects.get(id);
    parts.push(o ? `o:${id}:${o.status}:${o.source.length}` : `x:${id}`);
  }
  return fnv1a(parts.join("|")).toString(36);
}
