import { proxy } from "valtio";
import type { CanvasMode } from "./canvas/types";

export type AiStatus = "idle" | "thinking" | "done" | "error";

export const appState = proxy({
  mode: "hand" as CanvasMode,
  color: "#111111",
  pen: 3,
  zoom: 100,
  center: { x: 0, y: 0 },
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

export function setAiStatus(status: AiStatus): void {
  appState.aiStatus = status;
}

export function setAutoOn(on: boolean): void {
  appState.autoOn = on;
}