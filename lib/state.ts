import { proxy } from "valtio";
import type { CanvasMode } from "./canvas/types";

export type AiStatus = "idle" | "thinking" | "done" | "error";

export type GeometryType = "selection" | "widget" | "object" | "shape" | "stroke";

export interface GeometryInfo {
  type: GeometryType;
  label: string;
  id?: string;
  title?: string;
  kind?: string;
  status?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  contentW?: number;
  contentH?: number;
  isMarquee?: boolean;
  isMoving?: boolean;
  extra?: string;
}

export interface CursorInfo {
  x: number;
  y: number;
}

export const appState = proxy({
  mode: "hand" as CanvasMode,
  color: "#111111",
  pen: 3,
  zoom: 100,
  center: { x: 0, y: 0 },
  cursor: null as CursorInfo | null,
  geometry: null as GeometryInfo | null,
  aiStatus: "idle" as AiStatus,
  autoOn: true,
});

export function setMode(mode: CanvasMode): void {
  appState.mode = mode;
}

export function setColor(color: string): void {
  appState.color = color;
}

export function setPen(pen: number): void {
  appState.pen = pen;
}

export function setZoom(zoom: number): void {
  appState.zoom = zoom;
}

export function setCenter(x: number, y: number): void {
  appState.center = { x, y };
}

export function setCursor(cursor: CursorInfo | null): void {
  appState.cursor = cursor;
}

export function setGeometry(geometry: GeometryInfo | null): void {
  appState.geometry = geometry;
}

export function setAiStatus(status: AiStatus): void {
  appState.aiStatus = status;
}

export function setAutoOn(on: boolean): void {
  appState.autoOn = on;
}