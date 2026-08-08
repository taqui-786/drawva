import type { CanvasElement, Point } from "@/canvas/model/types";
import { elementCenter } from "./elementGeometry";
import { rectFromPoints, type Rect } from "./rectangle";

export type ResizeHandle =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw"
  | "rotation";

export const RESIZE_HANDLES: Exclude<ResizeHandle, "rotation">[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

/**
 * Resize a fresh-geometry rectangle from `startScene` (where the pointer went
 * down, on the handle) to `pointerScene`. `angle` is the element rotation.
 * Returns the new unrotated local rect (x/y/width/height) relative to the same
 * fixed center the element keeps during the drag.
 */
export function resizeRectFromPointer(
  handle: Exclude<ResizeHandle, "rotation">,
  original: Rect,
  center: Point,
  angle: number,
  pointerScene: Point,
  keepAspect: boolean,
): Rect {
  // work in the element's unrotated frame
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const toLocal = (p: Point): Point => {
    const dx = p[0] - center[0];
    const dy = p[1] - center[1];
    return [dx * cos - dy * sin, dy * cos + dx * sin];
  };
  const local = toLocal(pointerScene);

  const { x, y, width, height } = original;
  // convert to center-relative local coords
  const c = { x: x - center[0], y: y - center[1] };

  let left = c.x;
  let top = c.y;
  let right = c.x + width;
  let bottom = c.y + height;

  if (handle.includes("w")) left = local[0];
  if (handle.includes("e")) right = local[0];
  if (handle.includes("n")) top = local[1];
  if (handle.includes("s")) bottom = local[1];

  let newW = right - left;
  let newH = bottom - top;

  if (keepAspect && width !== 0 && height !== 0) {
    const ratio = width / height;
    if (Math.abs(newW) / Math.max(1e-6, Math.abs(newH)) > ratio) {
      newW = Math.sign(newW || 1) * Math.abs(newH) * ratio;
    } else {
      newH = Math.sign(newH || 1) * Math.abs(newW) / ratio;
    }
    if (handle.includes("w")) left = right - newW;
    else right = left + newW;
    if (handle.includes("n")) top = bottom - newH;
    else bottom = top + newH;
  }

  // negative-size normalization in scene space happens after rotation back
  void x;
  void y;
  return {
    x: left + center[0],
    y: top + center[1],
    width: newW,
    height: newH,
  };
}

/** Normalize negative width/height back to a positive rect, preserving center. Also normalizes linear element points relative to [0,0]. */
export function normalizeElementGeometry(el: CanvasElement): void {
  if (el.type === "line" || el.type === "arrow" || el.type === "freedraw") {
    if (el.points.length === 0) return;
    const xs = el.points.map((p) => p[0]);
    const ys = el.points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    if (minX !== 0 || minY !== 0) {
      el.x += minX;
      el.y += minY;
      el.points = el.points.map((p) => [p[0] - minX, p[1] - minY]);
    }
    el.width = Math.max(1, maxX - minX);
    el.height = Math.max(1, maxY - minY);
    return;
  }

  if (el.width < 0) {
    el.x += el.width * Math.cos(el.angle);
    el.y += el.width * Math.sin(el.angle);
    el.width = -el.width;
  }
  if (el.height < 0) {
    el.x -= el.height * Math.sin(el.angle);
    el.y += el.height * Math.cos(el.angle);
    el.height = -el.height;
  }
}

export function elementFromDrag(a: Point, b: Point, central: boolean): Rect & { center: Point } {
  if (!central) {
    const r = rectFromPoints(a, b);
    return { ...r, center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  }
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return {
    x: a[0] - Math.abs(dx),
    y: a[1] - Math.abs(dy),
    width: Math.abs(dx) * 2,
    height: Math.abs(dy) * 2,
    center: [a[0], a[1]],
  };
}

export { elementCenter };
