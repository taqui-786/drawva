import type { Rect } from "./types";
import type { WidgetManager } from "./widgets";
import type { ObjectManager } from "./objects";
import { detectDiagramFormat } from "./diagram";

export interface SceneItemJson {
  id?: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  sourceFormat?: string;
  text?: string;
}

export interface SceneJson {
  items: SceneItemJson[];
  count: number;
}

export function buildScene(
  widgets: WidgetManager | null,
  objects: ObjectManager | null
): SceneJson {
  const items: SceneItemJson[] = [];
  if (widgets) {
    for (const w of widgets.all()) {
      const item: SceneItemJson = {
        id: w.id,
        kind: w.kind,
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
        title: w.title,
      };
      if (w.kind === "diagram") {
        item.sourceFormat = w.sourceFormat || detectDiagramFormat(w.pluginId, w.copyText, w.title);
      }
      if (w.copyText && w.copyText.length < 300) item.text = w.copyText.slice(0, 300);
      items.push(item);
    }
  }
  if (objects) {
    for (const o of objects.all()) {
      const item: SceneItemJson = {
        id: o.id,
        kind: o.kind,
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        text: o.source.slice(0, 300),
      };
      if (o.kind === "formula") item.title = `LaTeX: ${o.source.slice(0, 200)}`;
      if (o.kind === "plot") item.title = `y = ${o.source.slice(0, 120)}`;
      items.push(item);
    }
  }
  items.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
  return { items, count: items.length };
}

export function visibleScene(
  widgets: WidgetManager | null,
  objects: ObjectManager | null,
  visibleRect: Rect
): SceneJson {
  const all = buildScene(widgets, objects);
  const inside = all.items.filter(
    (i) =>
      i.x < visibleRect.x + visibleRect.w &&
      i.x + i.w > visibleRect.x &&
      i.y < visibleRect.y + visibleRect.h &&
      i.y + i.h > visibleRect.y
  );
  return { items: inside, count: inside.length };
}
