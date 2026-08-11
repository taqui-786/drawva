import { CanvasItem } from "./types";
import { getItemBoundingBox } from "./selection";

export interface CompactSceneItem {
  id: string;
  kind: string;
  box: { x: number; y: number; w: number; h: number };
  text?: string;
  latex?: string;
  expression?: string;
  title?: string;
}

export function buildCompactSceneJson(items: CanvasItem[]): CompactSceneItem[] {
  return items.slice(0, 100).map((item) => {
    const box = getItemBoundingBox(item);
    const compact: CompactSceneItem = {
      id: item.id,
      kind: item.kind,
      box: {
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.w),
        h: Math.round(box.h),
      },
    };

    if (item.kind === "text") compact.text = item.text;
    else if (item.kind === "formula") compact.latex = item.latex;
    else if (item.kind === "plot") compact.expression = item.expression;
    else if (item.kind === "widget") compact.title = item.title;

    return compact;
  });
}
