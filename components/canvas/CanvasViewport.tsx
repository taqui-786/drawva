"use client";
// ============================================================
// Drawva — Canvas Viewport Component
// Mounts the canvas container, creates the engine, wires events.
// SSR-safe, StrictMode-safe synchronous initialization.
// ============================================================

import { useEffect, useRef } from "react";
import { useCanvasContext } from "./CanvasProvider";
import { CanvasEngine } from "@/lib/canvas/engine";
import type { ToolName } from "@/lib/canvas/types";

export function CanvasViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { engineRef, setState } = useCanvasContext();

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    // Synchronously instantiate engine on browser client
    const engine = new CanvasEngine(containerRef.current);
    engineRef.current = engine;

    // Subscribe engine events → mirror to React state (toolbar updates)
    const unsubs = [
      engine.on("toolChanged", (tool: ToolName) => {
        setState((s) => ({ ...s, activeTool: tool }));
      }),
      engine.on("colorChanged", (color: string) => {
        setState((s) => ({ ...s, color }));
      }),
      engine.on("sizeChanged", (size: number) => {
        setState((s) => ({ ...s, size }));
      }),
      engine.on("zoomChanged", (zoom: number) => {
        setState((s) => ({ ...s, zoom }));
      }),
      engine.on("canUndoChanged", (canUndo: boolean) => {
        setState((s) => ({ ...s, canUndo }));
      }),
      engine.on("canRedoChanged", (canRedo: boolean) => {
        setState((s) => ({ ...s, canRedo }));
      }),
      engine.on("saved", () => {
        setState((s) => ({ ...s, saved: true }));
      }),
    ];

    // Initial render call
    engine.requestRender();

    return () => {
      unsubs.forEach((u) => u());
      engine.destroy();
      engineRef.current = null;
    };
  }, [engineRef, setState]);

  return (
    <div
      ref={containerRef}
      id="canvas-viewport"
      className="flex-1 relative overflow-hidden"
      style={{ touchAction: "none" }}
      aria-label="Infinite canvas whiteboard"
    />
  );
}
