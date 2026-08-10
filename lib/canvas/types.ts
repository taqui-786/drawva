// ============================================================
// Drawva Canvas Engine — Shared Types
// ============================================================

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

export interface CameraState {
  scale: number;
  panX: number;
  panY: number;
}

export type TileKey = string; // "tx,ty"

// ── Stroke ─────────────────────────────────────────────────

export interface StrokePoint extends Point {
  pressure: number; // 0..1
}

export interface Stroke {
  id: string;
  tool: "pen" | "highlighter" | "eraser";
  points: StrokePoint[];
  color: string;
  size: number;
  opacity: number;
  committedToTiles: boolean;
}

// ── Items (objects that live on objectLayer) ───────────────

export interface TextItem {
  id: string;
  kind: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  width: number;
  height: number;
  /** base64 PNG of the rasterized text, kept for export */
  imageDataUrl?: string;
}

export interface ShapeItem {
  id: string;
  kind: "shape";
  type: "rect" | "ellipse" | "arrow" | "line";
  x: number;
  y: number;
  w: number;
  h: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  color: string;
  strokeWidth: number;
  fill: string;
}

export interface ImageItem {
  id: string;
  kind: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  src: string; // object URL or data URL
}

export interface WidgetItem {
  id: string;
  kind: "widget";
  x: number;
  y: number;
  w: number;
  h: number;
  widgetKind: "html" | "diagram";
  payload: string;
  title?: string;
  widgetType?: "diagram_source" | "html_widget";
  pluginId?: string;
  diagramKind?: string;
  sourceFormat?: string;
  source?: string;
  copyText?: string;
  copyLabel?: string;
  frameworkVersion?: string;
  dirtyMarks?: string[];
}

export type CanvasItem = TextItem | ShapeItem | ImageItem | WidgetItem;

// ── Draft items (pending AI output) ───────────────────────

export interface DraftItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  state: "pending" | "accepted" | "discarded";
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── Persistence ────────────────────────────────────────────

export interface CanvasDocument {
  id: string;
  version: 1;
  createdAt: number;
  updatedAt: number;
  tiles: Record<TileKey, string>; // PNG blob URLs / data URLs
  items: CanvasItem[];
  camera?: CameraState;
  previewDataUrl?: string;
}

// ── Commands (AI-ready contract) ───────────────────────────

export type CanvasCommand =
  | { tool: "write_text"; x: number; y: number; text: string; fontSize: number; maxWidth?: number }
  | { tool: "draw_formula"; x: number; y: number; latex: string; fontSize: number }
  | { tool: "plot_function"; x: number; y: number; w: number; h: number; expression: string }
  | { tool: "draw"; origin: Point; types: string[]; items: unknown[] }
  | { tool: "erase"; mode: "rect"; x: number; y: number; w: number; h: number }
  | {
      tool: "html_widget";
      x: number;
      y: number;
      w: number;
      h: number;
      title: string;
      html: string;
      pluginId?: string;
      diagramKind?: string;
      sourceFormat?: string;
      copyText?: string;
      copyLabel?: string;
      frameworkVersion?: string;
    }
  | {
      tool: "diagram_source";
      x: number;
      y: number;
      w: number;
      h: number;
      sourceFormat: string;
      source: string;
      title: string;
      pluginId?: string;
      diagramKind?: string;
      copyText?: string;
      copyLabel?: string;
      frameworkVersion?: string;
    };

// ── Undo snapshot ──────────────────────────────────────────

export interface TileSnapshot {
  key: TileKey;
  data: ImageData;
}

export interface UndoRecord {
  tilesBefore: TileSnapshot[];
  tilesAfter: TileSnapshot[];
  itemsBefore: CanvasItem[];
  itemsAfter: CanvasItem[];
  byteSize: number;
}

// ── Tool names ─────────────────────────────────────────────

export type ToolName =
  | "pen"
  | "highlighter"
  | "eraser"
  | "hand"
  | "select"
  | "text"
  | "rect"
  | "ellipse"
  | "arrow"
  | "line"
  | "image";

// ── Engine event map ───────────────────────────────────────

export interface EngineEventMap {
  toolChanged: ToolName;
  colorChanged: string;
  sizeChanged: number;
  zoomChanged: number;
  canUndoChanged: boolean;
  canRedoChanged: boolean;
  itemsChanged: CanvasItem[];
  cameraChanged: CameraState;
  saved: void;
  error: Error;
}
