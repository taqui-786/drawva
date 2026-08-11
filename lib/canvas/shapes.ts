import { ShapeItem, BoundingBox } from "./types";

export function createShapeItem(
  id: string,
  shapeType: "rect" | "ellipse" | "arrow" | "line",
  startPoint: { x: number; y: number },
  endPoint: { x: number; y: number },
  color: string,
  strokeWidth: number,
  fillColor?: string
): ShapeItem {
  let x = startPoint.x;
  let y = startPoint.y;
  let w = endPoint.x - startPoint.x;
  let h = endPoint.y - startPoint.y;

  if (shapeType === "rect" || shapeType === "ellipse") {
    if (w < 0) {
      x = endPoint.x;
      w = Math.abs(w);
    }
    if (h < 0) {
      y = endPoint.y;
      h = Math.abs(h);
    }
  }

  return {
    id,
    kind: "shape",
    shapeType,
    x,
    y,
    w,
    h,
    color,
    strokeWidth,
    fillColor,
  };
}

export function getShapeBoundingBox(shape: ShapeItem): BoundingBox {
  if (shape.shapeType === "rect" || shape.shapeType === "ellipse") {
    return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  }
  const minX = Math.min(shape.x, shape.x + shape.w);
  const minY = Math.min(shape.y, shape.y + shape.h);
  const maxX = Math.max(shape.x, shape.x + shape.w);
  const maxY = Math.max(shape.y, shape.y + shape.h);
  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}
