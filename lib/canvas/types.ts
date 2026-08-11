// Canvas Engine Core Types & Constants

export const TILE_SIZE = 512;
export const CANVAS_SIZE = 20000;
export const MIN_ZOOM = 0.03;
export const MAX_ZOOM = 4.0;
export const DEFAULT_ZOOM = 1.0;

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export type ToolType =
  | "select"
  | "hand"
  | "pen"
  | "highlighter"
  | "eraser"
  | "text"
  | "rect"
  | "ellipse"
  | "arrow"
  | "line"
  | "image"
  | "lasso";

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

export interface BaseCanvasItem {
  id: string;
  kind: string;
  locked?: boolean;
}

export interface StrokeItem extends BaseCanvasItem {
  kind: "stroke";
  tool: "pen" | "highlighter" | "eraser";
  points: StrokePoint[];
  color: string;
  size: number;
  opacity?: number;
  box: BoundingBox;
}

export interface ShapeItem extends BaseCanvasItem {
  kind: "shape";
  shapeType: "rect" | "ellipse" | "arrow" | "line";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  strokeWidth: number;
  fillColor?: string;
}

export interface TextBoxItem extends BaseCanvasItem {
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number;
  color: string;
  fontFamily?: string;
  maxWidth?: number;
  fontStyle?: string;
  opacity?: number;
  image?: HTMLImageElement;
}

export interface ImageItem extends BaseCanvasItem {
  kind: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  src?: string;
  naturalW?: number;
  naturalH?: number;
  opacity?: number;
  blob?: Blob;
  image?: HTMLImageElement;
}

export interface WidgetItem extends BaseCanvasItem {
  kind: "widget";
  widgetType: "html_widget" | "diagram_source";
  x: number;
  y: number;
  w: number;
  h: number;
  contentW: number;
  contentH: number;
  html?: string;
  source?: string;
  sourceFormat?: string;
  diagramKind?: string;
  pluginId?: string;
  title?: string;
  copyText?: string;
  copyLabel?: string;
  refreshSeconds?: number;
  shell?: HTMLElement;
  frame?: HTMLIFrameElement;
  snapshotImage?: HTMLImageElement;
}

export interface FormulaItem extends BaseCanvasItem {
  kind: "formula";
  x: number;
  y: number;
  w: number;
  h: number;
  latex: string;
  fontSize: number;
  color: string;
  svgImage?: HTMLImageElement;
}

export interface PlotItem extends BaseCanvasItem {
  kind: "plot";
  x: number;
  y: number;
  w: number;
  h: number;
  expression: string;
  color: string;
}

export type CanvasItem =
  | StrokeItem
  | ShapeItem
  | TextBoxItem
  | ImageItem
  | WidgetItem
  | FormulaItem
  | PlotItem;

export interface ViewportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type TileKey = string;
