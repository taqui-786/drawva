import type { CanvasElement, Point } from "@/canvas/model/types";
import { distanceToSegment, rotatePoint } from "./point";
import {
  pointInRect,
  rectCenter,
  rotatedRectBounds,
  rotatedRectCorners,
  type Rect,
} from "./rectangle";

/**
 * Single geometry source of truth (§74, §108). Rendering, hit testing, bounds,
 * selection and later SVG export must all use these functions.
 */

export function elementAABB(el: CanvasElement): Rect {
  return rotatedRectBounds(
    { x: el.x, y: el.y, width: el.width, height: el.height },
    el.angle,
  );
}

export function elementsAABB(elements: CanvasElement[]): Rect | null {
  const rects = elements.filter((e) => !e.isDeleted).map(elementAABB);
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Element center in scene space. */
export function elementCenter(el: CanvasElement): Point {
  return rectCenter({ x: el.x, y: el.y, width: el.width, height: el.height });
}

/** Element boundary outline in scene space (for stroke rendering + selection). */
export function elementOutline(el: CanvasElement): Point[] {
  return rotatedRectCorners(
    { x: el.x, y: el.y, width: el.width, height: el.height },
    el.angle,
  );
}

/**
 * Precision hit test. `tolerance` is in scene units (screen px / zoom).
 */
export function hitTestElement(
  el: CanvasElement,
  scenePoint: Point,
  tolerance: number,
): boolean {
  const local = rotatePoint(scenePoint, elementCenter(el), -el.angle);
  const rect: Rect = { x: el.x, y: el.y, width: el.width, height: el.height };

  switch (el.type) {
    case "rectangle":
    case "frame":
    case "image": {
      // filled shapes: inside-test with tolerance; transparent fill: border-only
      const hasFill = el.backgroundColor !== "transparent";
      if (hasFill) return pointInRect(local, rect);
      return isNearRectBorder(local, rect, Math.max(tolerance, el.strokeWidth / 2));
    }
    case "ellipse": {
      const rx = el.width / 2;
      const ry = el.height / 2;
      if (rx <= 0 || ry <= 0) return false;
      const dx = (local[0] - (el.x + rx)) / (rx + tolerance);
      const dy = (local[1] - (el.y + ry)) / (ry + tolerance);
      const outer = dx * dx + dy * dy <= 1;
      if (el.backgroundColor !== "transparent") return outer;
      // stroke-only ellipse: ring between inner and outer tolerance
      const dxI = (local[0] - (el.x + rx)) / Math.max(1, rx - tolerance);
      const dyI = (local[1] - (el.y + ry)) / Math.max(1, ry - tolerance);
      return outer && dxI * dxI + dyI * dyI >= 1;
    }
    case "diamond": {
      const corners = diamondCorners(el);
      return pointInPolygon(local, corners);
    }
    case "line":
    case "arrow":
    case "freedraw": {
      const pts = el.points.map((p): Point => [el.x + p[0], el.y + p[1]]);
      // account for rotation around element center
      const rotated =
        el.angle === 0
          ? pts
          : pts.map((p) => rotatePoint(p, elementCenter(el), el.angle));
      for (let i = 0; i < rotated.length - 1; i++) {
        if (distanceToSegment(scenePoint, rotated[i], rotated[i + 1]) <= tolerance) {
          return true;
        }
      }
      return false;
    }
    case "text": {
      return pointInRect(local, {
        x: rect.x - tolerance,
        y: rect.y - tolerance,
        width: rect.width + tolerance * 2,
        height: rect.height + tolerance * 2,
      });
    }
    default:
      return false;
  }
}

function isNearRectBorder(p: Point, r: Rect, tol: number): boolean {
  const inOuter = pointInRect(p, {
    x: r.x - tol,
    y: r.y - tol,
    width: r.width + tol * 2,
    height: r.height + tol * 2,
  });
  if (!inOuter) return false;
  const inInner = pointInRect(p, {
    x: r.x + tol,
    y: r.y + tol,
    width: Math.max(0, r.width - tol * 2),
    height: Math.max(0, r.height - tol * 2),
  });
  return !inInner;
}

export function diamondCorners(el: CanvasElement): Point[] {
  const local: Point[] = [
    [el.width / 2, 0],
    [el.width, el.height / 2],
    [el.width / 2, el.height],
    [0, el.height / 2],
  ];
  const center = elementCenter(el);
  return local
    .map((p): Point => [el.x + p[0], el.y + p[1]])
    .map((p) => (el.angle === 0 ? p : rotatePoint(p, center, el.angle)));
}

export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects =
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Does `el` fall inside `rect` (scene space)? If `containment` is true the
 * whole AABB must be inside, otherwise intersection is enough (§26).
 */
export function elementMatchesRect(
  el: CanvasElement,
  rect: Rect,
  containment: boolean,
): boolean {
  const bounds = elementAABB(el);
  const intersects =
    rect.x < bounds.x + bounds.width &&
    rect.x + rect.width > bounds.x &&
    rect.y < bounds.y + bounds.height &&
    rect.y + rect.height > bounds.y;
  if (!containment) return intersects;
  return (
    bounds.x >= rect.x &&
    bounds.y >= rect.y &&
    bounds.x + bounds.width <= rect.x + rect.width &&
    bounds.y + bounds.height <= rect.y + rect.height
  );
}
