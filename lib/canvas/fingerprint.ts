import type { CanvasEngine } from "./engine";
import type { WidgetManager } from "./widgets";
import type { ObjectManager } from "./objects";

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

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
