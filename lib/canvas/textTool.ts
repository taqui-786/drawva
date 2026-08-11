import { TextBoxItem, BoundingBox } from "./types";

export function createTextBoxItem(
  id: string,
  x: number,
  y: number,
  text: string,
  fontSize: number = 20,
  color: string = "#1e293b",
  maxWidth: number = 400
): TextBoxItem {
  const approxCharWidth = fontSize * 0.6;
  const approxWidth = Math.min(maxWidth, Math.max(100, text.length * approxCharWidth));
  const approxHeight = fontSize * 1.4;

  return {
    id,
    kind: "text",
    x,
    y,
    w: approxWidth,
    h: approxHeight,
    maxWidth,
    fontSize,
    color,
    text,
  };
}

export function renderTextBoxToCanvas(item: TextBoxItem): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.font = `${item.fontSize}px ui-rounded, system-ui, sans-serif`;
  const metrics = ctx.measureText(item.text);
  const width = Math.ceil(Math.max(item.w, metrics.width + 10));
  const height = Math.ceil(Math.max(item.h, item.fontSize * 1.5));

  canvas.width = width;
  canvas.height = height;

  ctx.font = `${item.fontSize}px ui-rounded, system-ui, sans-serif`;
  ctx.fillStyle = item.color;
  ctx.textBaseline = "top";
  ctx.fillText(item.text, 5, 5);

  return canvas;
}

export function getTextBoxBoundingBox(item: TextBoxItem): BoundingBox {
  return { x: item.x, y: item.y, w: item.w, h: item.h };
}
