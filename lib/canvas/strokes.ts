import { StrokeItem, StrokePoint, BoundingBox } from "./types";

export function createStrokeItem(
  id: string,
  tool: "pen" | "highlighter" | "eraser",
  points: StrokePoint[],
  color: string,
  size: number
): StrokeItem {
  const opacity = tool === "highlighter" ? 0.4 : 1.0;
  const box = computeStrokeBoundingBox(points, size);
  return {
    id,
    kind: "stroke",
    tool,
    points,
    color: tool === "eraser" ? "#ffffff" : color,
    size: tool === "highlighter" ? Math.max(20, size * 2.5) : size,
    opacity,
    box,
  };
}

export function computeStrokeBoundingBox(
  points: StrokePoint[],
  strokeSize: number
): BoundingBox {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const halfSize = strokeSize / 2;
  for (const pt of points) {
    minX = Math.min(minX, pt.x - halfSize);
    minY = Math.min(minY, pt.y - halfSize);
    maxX = Math.max(maxX, pt.x + halfSize);
    maxY = Math.max(maxY, pt.y + halfSize);
  }

  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}

export function pointDistanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);

  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export function isStrokeIntersectingEraser(
  stroke: StrokeItem,
  eraserPos: { x: number; y: number },
  eraserRadius: number
): boolean {
  const strokeMargin = stroke.size / 2;
  const totalRadius = eraserRadius + strokeMargin;

  for (let i = 0; i < stroke.points.length - 1; i++) {
    const p1 = stroke.points[i];
    const p2 = stroke.points[i + 1];
    const dist = pointDistanceToSegment(eraserPos.x, eraserPos.y, p1.x, p1.y, p2.x, p2.y);
    if (dist <= totalRadius) return true;
  }
  return false;
}
