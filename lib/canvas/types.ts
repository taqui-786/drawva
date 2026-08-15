export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CanvasMode =
  | "select"
  | "hand"
  | "pen"
  | "highlighter"
  | "eraser"
  | "text"
  | "rect"
  | "ellipse"
  | "arrow";

export interface CameraState {
  panX: number;
  panY: number;
  scale: number;
}

export interface TileKey {
  tx: number;
  ty: number;
}

export const tileKey = (tx: number, ty: number): string => `${tx},${ty}`;

export const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const unionRect = (a: Rect | null, b: Rect): Rect => {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
};
