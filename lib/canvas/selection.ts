import { CanvasItem, BoundingBox, Point } from "./types";
import { getShapeBoundingBox } from "./shapes";
import { getTextBoxBoundingBox } from "./textTool";

export interface SelectionState {
  selectedItemIds: string[];
  bounds: BoundingBox | null;
}

export function getItemBoundingBox(item: CanvasItem): BoundingBox {
  if (item.kind === "stroke") {
    return item.box;
  } else if (item.kind === "shape") {
    return getShapeBoundingBox(item);
  } else if (item.kind === "text") {
    return getTextBoxBoundingBox(item);
  } else if (item.kind === "image" || item.kind === "widget" || item.kind === "formula" || item.kind === "plot") {
    return { x: item.x, y: item.y, w: item.w, h: item.h };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

export function computeSelectionBounds(items: CanvasItem[], selectedIds: string[]): BoundingBox | null {
  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  if (selectedItems.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of selectedItems) {
    const box = getItemBoundingBox(item);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }

  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}

export function isPointInBox(point: Point, box: BoundingBox): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.w &&
    point.y >= box.y &&
    point.y <= box.y + box.h
  );
}

export function findItemAtPoint(items: CanvasItem[], point: Point): CanvasItem | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const box = getItemBoundingBox(item);
    if (isPointInBox(point, box)) return item;
  }
  return null;
}

export function moveItem(item: CanvasItem, dx: number, dy: number): CanvasItem {
  if (item.kind === "stroke") {
    const newPoints = item.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
    return {
      ...item,
      points: newPoints,
      box: { ...item.box, x: item.box.x + dx, y: item.box.y + dy },
    };
  } else if (item.kind === "shape" || item.kind === "text" || item.kind === "image" || item.kind === "widget" || item.kind === "formula" || item.kind === "plot") {
    return {
      ...item,
      x: item.x + dx,
      y: item.y + dy,
    };
  }
  return item;
}

export function isPointInPolygon(point: Point, vs: Point[]): boolean {
  const x = point.x;
  const y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x;
    const yi = vs[i].y;
    const xj = vs[j].x;
    const yj = vs[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function findItemsInLasso(items: CanvasItem[], polygon: Point[]): string[] {
  if (polygon.length < 3) return [];
  const selectedIds: string[] = [];

  for (const item of items) {
    if (item.kind === "stroke") {
      const isAnyPointIn = item.points.some((p) => isPointInPolygon(p, polygon));
      if (isAnyPointIn) {
        selectedIds.push(item.id);
        continue;
      }
    }

    const box = getItemBoundingBox(item);
    const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    if (
      isPointInPolygon(center, polygon) ||
      isPointInPolygon({ x: box.x, y: box.y }, polygon) ||
      isPointInPolygon({ x: box.x + box.w, y: box.y }, polygon) ||
      isPointInPolygon({ x: box.x, y: box.y + box.h }, polygon) ||
      isPointInPolygon({ x: box.x + box.w, y: box.y + box.h }, polygon)
    ) {
      selectedIds.push(item.id);
    }
  }

  return selectedIds;
}
