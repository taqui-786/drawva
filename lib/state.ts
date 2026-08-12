import { proxy } from "valtio";
import type { CanvasMode } from "./canvas/types";

export type AiStatus = "idle" | "thinking" | "done" | "error";

/**
 * Global canvas state, shared Penecho-style: any module (React shell, tool
 * managers, engine code) can read `appState.x` and write through the exported
 * action functions below. React re-renders automatically via useSnapshot.
 *
 * Only UI-level state lives here. Per-pointermove hot data (stroke points,
 * bboxes, pressure) stays inside the engine to avoid per-frame re-renders.
 */
export const appState = proxy({
  mode: "pen" as CanvasMode,
  color: "#111111",
  pen: 3,
  zoom: 100,
  center: { x: 0, y: 0 },
  aiStatus: "idle" as AiStatus,
  autoOn: true,
});

// ---- Actions (Penecho-style mutators) -----------------------------------
// Routed through functions at module scope so any component or framework-free
// module can update shared state without tripping React immutability rules.

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