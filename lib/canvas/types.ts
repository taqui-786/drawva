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

export const tileKey = (tx: number, ty: number): string => `${tx},${ty}`;

export const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

